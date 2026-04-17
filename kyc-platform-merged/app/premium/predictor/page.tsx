import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import type { Metadata } from 'next';
import { getEffectiveServerSession } from '@/lib/auth/current-user';
import PredictorPaywall from '@/components/predictor/PredictorPaywall';
import PredictorFilters from '@/components/predictor/PredictorFilters';
import ForecastLineChart from '@/components/predictor/ForecastLineChart';
import { canAccessPredictorRelease, getPredictorReleaseMode } from '@/lib/product/predictor';
import { buildSeedOptions, buildSeedSummary, getSeedRecords, getSeedFetchedAt } from '@/lib/forecasting/data/seed';
import { fallbackForecastResponse, fallbackQualityResponse, fallbackDriversResponse } from '@/lib/forecasting/fallback';

export const metadata: Metadata = {
  title: 'Price Predictor',
  description: 'AI-assisted commodity price forecast based on Agmarknet mandi data. Research tool only — not financial advice.',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function fmtCurrency(value: number | null) {
  if (value == null || Number.isNaN(value)) return '—';
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: value >= 100 ? 0 : 2 })}`;
}

function trendColor(d: 'up' | 'down' | 'flat') {
  return d === 'up' ? 'var(--green)' : d === 'down' ? 'var(--red)' : 'var(--muted)';
}

function buildMarketRows(records: ReturnType<typeof getSeedRecords>) {
  const map = new Map<string, { modal: number[]; min: number[]; max: number[]; state: string; district: string }>();
  for (const r of records) {
    const key = r.market || 'Unknown';
    const ex  = map.get(key) ?? { modal: [], min: [], max: [], state: r.state, district: r.district };
    if (typeof r.modal_price === 'number') ex.modal.push(r.modal_price);
    if (typeof r.min_price   === 'number') ex.min.push(r.min_price);
    if (typeof r.max_price   === 'number') ex.max.push(r.max_price);
    map.set(key, ex);
  }
  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : null;
  return [...map.entries()]
    .map(([market, row]) => ({
      market, state: row.state, district: row.district,
      modal_price: avg(row.modal), min_price: avg(row.min), max_price: avg(row.max),
    }))
    .filter((r) => r.modal_price !== null)
    .sort((a, b) => (b.modal_price ?? 0) - (a.modal_price ?? 0))
    .slice(0, 20);
}

function PriceRangeBar({ min, current, max }: { min: number; current: number; max: number }) {
  const span = max - min || 1;
  const pct  = Math.min(100, Math.max(0, Math.round(((current - min) / span) * 100)));
  return (
    <div>
      <div className="pred-range-track">
        <div className="pred-range-fill" style={{ width: `${pct}%` }} />
        <div className="pred-range-marker" style={{ left: `${pct}%` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--dim)', marginTop: 8 }}>
        <span>{fmtCurrency(min)} <span style={{ fontSize: 10 }}>low</span></span>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>
          {fmtCurrency(current)} <span style={{ color: 'var(--green)', fontSize: 10 }}>({pct}th pct)</span>
        </span>
        <span><span style={{ fontSize: 10 }}>high</span> {fmtCurrency(max)}</span>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, color: 'var(--dim)', letterSpacing: '.07em',
      textTransform: 'uppercase', fontWeight: 700, marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

// ── Freshness helpers ─────────────────────────────────────────────────────────

function dateFreshness(isoDate: string | null) {
  if (!isoDate) return { label: 'Unknown', stale: true };
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
  if (days <= 1) return { label: 'Today',         stale: false };
  if (days <= 3) return { label: `${days}d ago`,  stale: false };
  if (days <= 7) return { label: `${days}d ago`,  stale: true  };
  return { label: `${days}d ago`, stale: true };
}

export default async function PredictorPage({ searchParams }: Props) {
  noStore();

  const session = await getEffectiveServerSession();
  const mode    = getPredictorReleaseMode();
  const hasAccess = canAccessPredictorRelease(session);

  if (!session && mode === 'auth') redirect('/login?from=/premium/predictor');
  if (!hasAccess) return <PredictorPaywall />;

  // ── Resolve filters from URL ──────────────────────────────────────────────
  const params = (await searchParams) ?? {};
  const options = buildSeedOptions();

  const fallbackCommodity = 'Wheat';
  const fallbackState     = 'Madhya Pradesh';

  const reqCommodity = first(params.commodity)?.trim();
  const reqState     = first(params.state)?.trim();
  const reqMarket    = first(params.market)?.trim();
  const reqHorizon   = Number.parseInt(first(params.horizon) ?? '', 10);

  const commodity = reqCommodity && options.commodities.includes(reqCommodity) ? reqCommodity : fallbackCommodity;
  const state     = reqState && options.states.includes(reqState) ? reqState : fallbackState;
  const markets   = state ? (options.marketsByState[state] ?? []) : options.markets;
  const market    = reqMarket && markets.includes(reqMarket) ? reqMarket : '';
  const horizon   = Number.isFinite(reqHorizon) ? Math.min(14, Math.max(3, reqHorizon)) : 14;

  // ── Fetch data ────────────────────────────────────────────────────────────
  const filters     = { commodity, state, market: market || undefined };
  const seedRecords = getSeedRecords(filters);
  const summary     = buildSeedSummary(filters);
  const marketRows  = buildMarketRows(seedRecords);
  const fetchedAt   = getSeedFetchedAt();

  const [forecast, quality, drivers] = await Promise.all([
    fallbackForecastResponse({ commodity, state, market: market || undefined, horizon }),
    fallbackQualityResponse({ commodity, state, market: market || undefined }),
    fallbackDriversResponse({ commodity, state, market: market || undefined, horizon }),
  ]);

  // ── Derived values ────────────────────────────────────────────────────────
  const tc    = trendColor(forecast.direction);
  const arrow = forecast.direction === 'up' ? '↑' : forecast.direction === 'down' ? '↓' : '→';
  const maxMarketPrice = Math.max(...marketRows.map((r) => r.modal_price ?? 0), 1);
  const maxDriverImp   = Math.max(...drivers.top_features.map((f) => f.importance), 0.01);

  const dataDate   = summary.latestArrivalDate;
  const freshness  = dateFreshness(dataDate);

  return (
    <main className="predictor-shell">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ paddingBottom: 18, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
        <div className="pred-header-row">
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 className="serif" style={{ fontSize: 'clamp(18px,3.5vw,24px)', margin: 0 }}>⚡ Price Predictor</h1>
              <span className="badge badge-gold" style={{ fontSize: 10 }}>AI-assisted</span>
              <span className="badge" style={{ color: tc, borderColor: `${tc}44`, background: `${tc}12`, fontSize: 11 }}>
                {arrow} {forecast.direction === 'flat' ? 'Stable' : `${Math.abs(forecast.trend_pct).toFixed(1)}%`}
              </span>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0, lineHeight: 1.4 }}>
              {horizon}-day horizon · {commodity}{state ? ` · ${state}` : ''}
            </p>
          </div>

          {/* Price + freshness */}
          <div className="pred-header-right">
            <div className="pred-header-price" style={{ color: tc, lineHeight: 1, marginBottom: 4 }}>
              {fmtCurrency(forecast.latest_price)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 6 }}>
              {forecast.latest_date ?? 'latest'} · {forecast.market}
            </div>
            <div className={`pred-freshness`}>
              <span className={`pred-freshness-dot${freshness.stale ? ' stale' : ''}`} />
              Data: {dataDate ?? '—'} ({freshness.label})
            </div>
          </div>
        </div>
      </div>

      {/* ── AI disclaimer ────────────────────────────────────────────────── */}
      <div className="notice notice-yellow" style={{ marginBottom: 18, fontSize: 13, lineHeight: 1.6, padding: '10px 14px' }}>
        <strong style={{ marginRight: 4 }}>AI overview:</strong>
        This is an AI generated forecast analysis based on different data sources.
        It is not financial advice. Kindly recheck and confirm before making any financial decisions.
      </div>

      {/* ── Two-column grid ──────────────────────────────────────────────── */}
      <div className="predictor-grid">

        {/* ── Sidebar ────────────────────────────────────────────────────── */}
        <aside style={{ display: 'grid', gap: 14 }}>

          {/* Dependent filter form (client component) */}
          <PredictorFilters
            options={{
              commodities:    options.commodities,
              states:         options.states,
              markets:        options.markets,
              marketsByState: options.marketsByState,
            }}
            current={{ commodity, state, market, horizon }}
          />

          {/* Data status card */}
          <div className="card" style={{ padding: '16px 18px' }}>
            <SectionLabel>Data status</SectionLabel>
            {([
              ['Records',  summary.recordsCount.toLocaleString()],
              ['Markets',  summary.marketsCount.toLocaleString()],
              ['States',   options.states.length.toLocaleString()],
              ['Latest',   summary.latestArrivalDate ?? '—'],
              ['Model',    forecast.model_used],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12,
              }}>
                <span style={{ color: 'var(--muted)' }}>{label}</span>
                <span style={{
                  fontWeight: 500, color: 'var(--text)', textAlign: 'right',
                  maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{value}</span>
              </div>
            ))}
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--dim)', lineHeight: 1.5 }}>
              Snapshot: {fetchedAt.slice(0, 10)}
            </div>
          </div>
        </aside>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>

          {/* KPI cards — 2-col mobile (Range spans full width), 3-col 480px+ */}
          <div className="pred-kpi-grid">
            <div className="card metric-card">
              <div className="metric-label">Modal Price</div>
              <div className="metric-val" style={{ color: 'var(--text)' }}>{fmtCurrency(summary.avgModalPrice)}</div>
            </div>
            <div className="card metric-card">
              <div className="metric-label">Markets</div>
              <div className="metric-val" style={{ color: 'var(--green)' }}>{summary.marketsCount.toLocaleString()}</div>
            </div>
            <div className="card metric-card pred-kpi-wide">
              <div className="metric-label">Price Range</div>
              <div className="metric-val" style={{ color: 'var(--muted)', fontSize: 'clamp(12px,3.5vw,17px)' }}>
                {fmtCurrency(summary.avgMinPrice)} – {fmtCurrency(summary.avgMaxPrice)}
              </div>
            </div>
          </div>

          {/* Price position gauge */}
          {summary.avgMinPrice != null && summary.avgMaxPrice != null && summary.avgModalPrice != null
           && summary.avgMaxPrice > summary.avgMinPrice && (
            <div className="card" style={{ padding: '16px 20px' }}>
              <SectionLabel>Current price position</SectionLabel>
              <PriceRangeBar min={summary.avgMinPrice} current={summary.avgModalPrice} max={summary.avgMaxPrice} />
            </div>
          )}

          {/* Forecast card */}
          <div className="card-elevated pred-forecast-card" style={{ display: 'grid', gap: 20 }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'Lora,serif', fontSize: 17, fontWeight: 600 }}>
                {horizon}-Day Forecast
              </span>
              <span className="badge" style={{ color: tc, borderColor: `${tc}44`, background: `${tc}10` }}>
                {arrow} {forecast.direction === 'flat' ? 'Stable' : `${Math.abs(forecast.trend_pct).toFixed(1)}%`}
              </span>
              {forecast.meta.backtest.smape != null && (
                <span style={{ fontSize: 11, color: 'var(--dim)', marginLeft: 'auto' }}>
                  sMAPE {forecast.meta.backtest.smape.toFixed(1)}%
                </span>
              )}
            </div>

            {forecast.insufficient ? (
              <div className="notice notice-gold">
                {forecast.message || 'Insufficient history for this selection. Try a broader filter.'}
              </div>
            ) : (
              <>
                {/* Summary text */}
                <div style={{ padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, border: `1px solid ${tc}33` }}>
                  <SectionLabel>What the model says</SectionLabel>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: 'var(--text)' }}>
                    {forecast.direction === 'flat'
                      ? `${commodity} prices look stable. The model expects minimal movement over the next ${horizon} days, hovering near ${fmtCurrency(forecast.latest_price)}/quintal.`
                      : `The model projects a ${forecast.direction === 'up' ? 'rise' : 'fall'} of ${Math.abs(forecast.trend_pct).toFixed(1)}% for ${commodity} over the next ${horizon} days`
                        + (forecast.forecast.at(-1)
                          ? `, reaching ~${fmtCurrency(forecast.forecast.at(-1)!.point)} by ${new Date(forecast.forecast.at(-1)!.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`
                          : '.')
                    }
                    {forecast.meta.backtest.smape != null && ` Model error (sMAPE): ${forecast.meta.backtest.smape.toFixed(1)}%.`}
                  </p>
                </div>

                {/* Chart */}
                {(forecast.history_series?.length ?? 0) > 0 && (
                  <div className="pred-chart-wrap">
                    <ForecastLineChart
                      historySeries={forecast.history_series!}
                      forecast={forecast.forecast}
                      latestPrice={forecast.latest_price}
                      commodity={commodity}
                      direction={forecast.direction}
                    />
                  </div>
                )}

                {/* Day cards */}
                <div>
                  <SectionLabel>Daily forecast</SectionLabel>
                  <div className="pred-day-strip">
                    {forecast.forecast.map((point) => {
                      const diff      = point.point - (forecast.latest_price ?? point.point);
                      const up        = diff >= 0;
                      const pctChange = forecast.latest_price
                        ? Math.abs((diff / forecast.latest_price) * 100) : 0;
                      return (
                        <div key={point.date} className="pred-day-card"
                          style={{ border: `1px solid ${up ? 'rgba(76,175,80,.2)' : 'rgba(239,83,80,.15)'}` }}>
                          <div className="pred-day-date">
                            {new Date(point.date).toLocaleDateString('en-IN', { weekday: 'short' })}
                            <br />
                            {new Date(point.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </div>
                          <div className="pred-day-price">{fmtCurrency(point.point)}</div>
                          <div className="pred-day-pct" style={{ color: up ? 'var(--green)' : 'var(--red)' }}>
                            {up ? '↑' : '↓'} {pctChange.toFixed(1)}%
                          </div>
                          <div className="pred-day-range">
                            {fmtCurrency(point.lower)}–{fmtCurrency(point.upper)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Before you act */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <SectionLabel>Before you act</SectionLabel>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {[
                      { title: 'Cross-check locally.', body: 'Agmarknet data can lag 24–48 hours. Call your nearest mandi before acting.' },
                      { title: 'Use the confidence band.', body: 'The shaded range in the chart shows uncertainty. Wider = less reliable.' },
                      { title: 'Research tool only.', body: 'Not financial advice. Consult a qualified market expert before trading decisions.' },
                    ].map((item) => (
                      <div key={item.title} style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, paddingLeft: 14, borderLeft: `2px solid ${tc}55` }}>
                        <strong style={{ color: 'var(--text)' }}>{item.title}</strong> {item.body}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Bottom 3-panel grid */}
          <div className="pred-bottom-grid">

            {/* Top markets */}
            <div className="card" style={{ padding: '16px 18px' }}>
              <SectionLabel>Top markets — {commodity}</SectionLabel>
              {marketRows.length ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {marketRows.slice(0, 10).map((row) => {
                    const barPct = Math.round(((row.modal_price ?? 0) / maxMarketPrice) * 100);
                    return (
                      <div key={row.market}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3, gap: 6 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                            {row.market}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--dim)', flexShrink: 0 }}>{row.district}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', flexShrink: 0 }}>
                            {fmtCurrency(row.modal_price)}
                          </div>
                        </div>
                        <div style={{ height: 3, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${barPct}%`, background: 'var(--green)', opacity: 0.65, borderRadius: 99 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>No markets for this selection.</p>
              )}
            </div>

            {/* Data quality */}
            <div className="card" style={{ padding: '16px 18px' }}>
              <SectionLabel>Data quality</SectionLabel>
              {(() => {
                const dq         = quality.data_quality;
                const missingPct = Math.round(dq.missing_ratio * 100);
                const realPct    = 100 - missingPct;
                const rating     = dq.missing_ratio > 0.4 || dq.real_days < 14
                  ? { label: 'Low',    color: 'var(--red)'   }
                  : dq.missing_ratio > 0.2 || dq.stale_days > 5
                    ? { label: 'Medium', color: 'var(--gold)'  }
                    : { label: 'High',   color: 'var(--green)' };
                return (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: rating.color }} />
                      <span style={{ fontWeight: 600, fontSize: 14, color: rating.color }}>{rating.label} quality</span>
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--dim)', marginBottom: 4 }}>
                        <span>Real data</span><span>{dq.real_days}d ({realPct}%)</span>
                      </div>
                      <div style={{ height: 5, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${realPct}%`, background: rating.color, opacity: 0.8 }} />
                      </div>
                    </div>
                    {[['Missing', dq.missing_days], ['Outliers', dq.outlier_days], ['Stale runs', dq.stale_days]].map(([l, v]) => (
                      <div key={String(l)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderBottom: '1px solid var(--border)', paddingBottom: 5 }}>
                        <span style={{ color: 'var(--muted)' }}>{l}</span>
                        <span style={{ fontWeight: 600 }}>{v}</span>
                      </div>
                    ))}
                    {dq.date_range && (
                      <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                        {dq.date_range[0]} → {dq.date_range[1]}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Forecast drivers */}
            <div className="card" style={{ padding: '16px 18px' }}>
              <SectionLabel>Forecast drivers</SectionLabel>
              <div style={{ display: 'grid', gap: 10 }}>
                {drivers.top_features.slice(0, 5).map((feature) => {
                  const barPct  = Math.round((feature.importance / maxDriverImp) * 100);
                  const dColor  = feature.direction === 'positive' ? 'var(--green)' : feature.direction === 'negative' ? 'var(--red)' : 'var(--gold)';
                  const dirIcon = feature.direction === 'positive' ? '↑' : feature.direction === 'negative' ? '↓' : '→';
                  return (
                    <div key={feature.feature_name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: 'var(--muted)', fontWeight: 500 }}>
                          {feature.feature_name.replace(/_/g, ' ')}
                        </span>
                        <span style={{ color: dColor, fontWeight: 700, fontSize: 11 }}>
                          {dirIcon} {(feature.importance * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ height: 3, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${barPct}%`, background: dColor, opacity: 0.75 }} />
                      </div>
                    </div>
                  );
                })}
                {drivers.recent_error_band != null && (
                  <div style={{ fontSize: 11, color: 'var(--dim)', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                    Recent error band: ±{drivers.recent_error_band.toFixed(1)}%
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}
