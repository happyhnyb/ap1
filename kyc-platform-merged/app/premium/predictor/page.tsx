import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import type { Metadata } from 'next';
import { getEffectiveServerSession } from '@/lib/auth/current-user';
import PredictorPaywall from '@/components/predictor/PredictorPaywall';
import { PredictorDisclaimer } from '@/components/predictor/PredictorDisclaimer';
import ForecastLineChart from '@/components/predictor/ForecastLineChart';
import { canAccessPredictorRelease, getPredictorReleaseMode } from '@/lib/product/predictor';
import { buildSeedOptions, buildSeedSummary, getSeedRecords } from '@/lib/forecasting/data/seed';
import { fallbackForecastResponse, fallbackQualityResponse, fallbackDriversResponse } from '@/lib/forecasting/fallback';

export const metadata: Metadata = {
  title: 'Predictor',
  description: 'AI-assisted commodity forecast analysis based on multiple data sources. Use it as a research aid, not a sole decision tool.',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PredictorPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function fmtCurrency(value: number | null) {
  if (value == null || Number.isNaN(value)) return '—';
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: value >= 100 ? 0 : 2 })}`;
}

function trendColor(direction: 'up' | 'down' | 'flat') {
  if (direction === 'up') return 'var(--green)';
  if (direction === 'down') return 'var(--red)';
  return 'var(--muted)';
}

function buildMarketRows(records: ReturnType<typeof getSeedRecords>) {
  const marketMap = new Map<string, { modal: number[]; min: number[]; max: number[]; state: string; district: string }>();
  for (const r of records) {
    const key = r.market || 'Unknown';
    const existing = marketMap.get(key) ?? { modal: [], min: [], max: [], state: r.state, district: r.district };
    if (typeof r.modal_price === 'number') existing.modal.push(r.modal_price);
    if (typeof r.min_price === 'number') existing.min.push(r.min_price);
    if (typeof r.max_price === 'number') existing.max.push(r.max_price);
    marketMap.set(key, existing);
  }
  const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : null);
  return [...marketMap.entries()]
    .map(([market, row]) => ({ market, state: row.state, district: row.district, modal_price: avg(row.modal), min_price: avg(row.min), max_price: avg(row.max) }))
    .filter((row) => row.modal_price !== null)
    .sort((a, b) => (b.modal_price ?? 0) - (a.modal_price ?? 0))
    .slice(0, 20);
}

/** Horizontal range bar — where does current price sit between min and max? */
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
        <span>{fmtCurrency(min)} <span style={{ color: 'var(--dim)', fontSize: 10 }}>min</span></span>
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmtCurrency(current)} <span style={{ color: 'var(--green)', fontSize: 10 }}>({pct}th pct)</span></span>
        <span><span style={{ color: 'var(--dim)', fontSize: 10 }}>max</span> {fmtCurrency(max)}</span>
      </div>
    </div>
  );
}

export default async function PredictorPage({ searchParams }: PredictorPageProps) {
  noStore();

  const session = await getEffectiveServerSession();
  const mode = getPredictorReleaseMode();
  const hasAccess = canAccessPredictorRelease(session);

  if (!session && mode === 'auth') {
    redirect('/login?from=/premium/predictor');
  }

  if (!hasAccess) {
    return <PredictorPaywall />;
  }

  const params = (await searchParams) ?? {};
  const options = buildSeedOptions();
  const fallbackCommodity = 'Wheat';
  const fallbackState = 'Madhya Pradesh';

  const requestedCommodity = first(params.commodity)?.trim();
  const requestedState     = first(params.state)?.trim();
  const requestedMarket    = first(params.market)?.trim();
  const requestedHorizon   = Number.parseInt(first(params.horizon) ?? '', 10);

  const commodity = requestedCommodity && options.commodities.includes(requestedCommodity) ? requestedCommodity : fallbackCommodity;
  const state     = requestedState && options.states.includes(requestedState) ? requestedState : fallbackState;
  const markets   = state ? (options.marketsByState[state] ?? []) : options.markets;
  const market    = requestedMarket && markets.includes(requestedMarket) ? requestedMarket : '';
  const horizon   = Number.isFinite(requestedHorizon) ? Math.min(14, Math.max(3, requestedHorizon)) : 14;

  const filters     = { commodity, state, market: market || undefined };
  const seedRecords = getSeedRecords(filters);
  const summary     = buildSeedSummary(filters);
  const marketRows  = buildMarketRows(seedRecords);

  const [forecast, quality, drivers] = await Promise.all([
    fallbackForecastResponse({ commodity, state, market: market || undefined, horizon }),
    fallbackQualityResponse({ commodity, state, market: market || undefined }),
    fallbackDriversResponse({ commodity, state, market: market || undefined, horizon }),
  ]);

  const tc    = trendColor(forecast.direction);
  const arrow = forecast.direction === 'up' ? '↑' : forecast.direction === 'down' ? '↓' : '→';

  const maxMarketPrice = Math.max(...marketRows.map((r) => r.modal_price ?? 0), 1);
  const maxDriverImp   = Math.max(...drivers.top_features.map((f) => f.importance), 0.01);

  return (
    <main className="predictor-shell">

      {/* ── Page header ──────────────────────────────────────────── */}
      <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 className="serif" style={{ fontSize: 'clamp(18px,4vw,26px)', margin: 0 }}>⚡ Price Predictor</h1>
              <span className="badge badge-gold" style={{ fontSize: 10 }}>AI-assisted</span>
              <span className="badge" style={{ color: tc, borderColor: `${tc}44`, background: `${tc}12`, fontSize: 11 }}>
                {arrow} {forecast.direction === 'flat' ? 'Stable' : `${Math.abs(forecast.trend_pct).toFixed(1)}%`}
              </span>
            </div>
            <p style={{ color: 'var(--muted)', margin: '5px 0 0', fontSize: 13 }}>
              Live Agmarknet · {horizon}-day horizon · {commodity}{state ? ` · ${state}` : ''}
            </p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 'clamp(22px,5vw,30px)', fontFamily: 'Lora,serif', fontWeight: 700, lineHeight: 1, color: tc }}>
              {fmtCurrency(forecast.latest_price)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 3 }}>
              {forecast.latest_date || 'latest'} · {forecast.market}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <PredictorDisclaimer />
      </div>

      <div className="predictor-grid">

        {/* ── Sidebar ────────────────────────────────────────────── */}
        <aside style={{ display: 'grid', gap: 12 }}>
          <div className="card" style={{ padding: 16 }}>
            <details open className="pred-filter-details">
              <summary className="pred-filter-summary">
                <span style={{ fontFamily: 'Lora,serif', fontSize: 15, fontWeight: 600 }}>Filter data</span>
                <span style={{ fontSize: 13, color: 'var(--dim)' }}>▾</span>
              </summary>
              <div className="pred-filter-body">
                <form method="get" style={{ display: 'grid', gap: 10, marginTop: 4 }}>
                  <div className="form-group">
                    <label className="form-label">Commodity</label>
                    <select name="commodity" className="select" defaultValue={commodity}>
                      {options.commodities.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">State</label>
                    <select name="state" className="select" defaultValue={state}>
                      {options.states.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Market</label>
                    <select name="market" className="select" defaultValue={market}>
                      <option value="">All markets</option>
                      {markets.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Horizon</label>
                    <select name="horizon" className="select" defaultValue={String(horizon)}>
                      {[3, 5, 7, 10, 14].map((d) => <option key={d} value={d}>{d} days</option>)}
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primary btn-full">Apply Filters</button>
                </form>
              </div>
            </details>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>
              Data status
            </div>
            {([
              ['Records',  summary.recordsCount.toLocaleString()],
              ['Markets',  summary.marketsCount.toLocaleString()],
              ['Latest',   summary.latestArrivalDate || '—'],
              ['Model',    forecast.model_used],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <span style={{ color: 'var(--muted)' }}>{label}</span>
                <span style={{ fontWeight: 500, color: 'var(--text)', textAlign: 'right', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Main content ───────────────────────────────────────── */}
        <div style={{ display: 'grid', gap: 14 }}>

          {/* Metric cards row */}
          <div className="grid-3" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            {[
              { label: 'Modal Price',      val: fmtCurrency(summary.avgModalPrice), color: 'var(--text)' },
              { label: 'Min–Max Range',    val: `${fmtCurrency(summary.avgMinPrice)}–${fmtCurrency(summary.avgMaxPrice)}`, color: 'var(--muted)' },
              { label: 'Markets tracked',  val: summary.marketsCount.toLocaleString(), color: 'var(--green)' },
            ].map((m) => (
              <div key={m.label} className="card metric-card">
                <div className="metric-label">{m.label}</div>
                <div className="metric-val" style={{ color: m.color, fontSize: 'clamp(16px,3.5vw,24px)' }}>{m.val}</div>
              </div>
            ))}
          </div>

          {/* Price range gauge */}
          {summary.avgMinPrice != null && summary.avgMaxPrice != null && summary.avgModalPrice != null
            && summary.avgMaxPrice > summary.avgMinPrice && (
            <div className="card" style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>
                Current price position
              </div>
              <PriceRangeBar min={summary.avgMinPrice} current={summary.avgModalPrice} max={summary.avgMaxPrice} />
            </div>
          )}

          {/* ── Forecast card ─────────────────────────────────── */}
          <div className="card-elevated" style={{ padding: '20px 20px', display: 'grid', gap: 18 }}>

            {/* Forecast header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'Lora,serif', fontSize: 16, fontWeight: 600 }}>{horizon}-Day Forecast</span>
              <span className="badge" style={{ color: tc, borderColor: `${tc}44`, background: `${tc}10`, fontSize: 12 }}>
                {arrow} {forecast.direction === 'flat' ? 'Stable' : `${Math.abs(forecast.trend_pct).toFixed(1)}%`}
              </span>
              {forecast.meta.backtest.smape != null && (
                <span style={{ fontSize: 11, color: 'var(--dim)', marginLeft: 'auto' }}>
                  sMAPE {forecast.meta.backtest.smape.toFixed(1)}%
                </span>
              )}
            </div>

            {forecast.insufficient ? (
              <div className="notice notice-gold">{forecast.message || 'Insufficient history for this selection. Try a broader filter.'}</div>
            ) : (
              <>
                {/* Plain-English summary */}
                <div style={{ padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, border: `1px solid ${tc}33` }}>
                  <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, marginBottom: 6 }}>
                    What the model says
                  </div>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: 'var(--text)' }}>
                    {forecast.direction === 'flat'
                      ? `${commodity} prices look stable. The model expects minimal movement over the next ${horizon} days, hovering near ${fmtCurrency(forecast.latest_price)}/quintal.`
                      : `The model projects a ${forecast.direction === 'up' ? 'rise' : 'fall'} of ${Math.abs(forecast.trend_pct).toFixed(1)}% for ${commodity} over the next ${horizon} days`
                        + (forecast.forecast.at(-1) ? `, reaching ~${fmtCurrency(forecast.forecast.at(-1)!.point)} by ${new Date(forecast.forecast.at(-1)!.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.` : '.')
                    }
                    {forecast.meta.backtest.smape != null && ` Model error (sMAPE): ${forecast.meta.backtest.smape.toFixed(1)}%.`}
                  </p>
                </div>

                {/* Time-series line chart */}
                {(forecast.history_series?.length ?? 0) > 0 && (
                  <div style={{ margin: '0 -4px' }}>
                    <ForecastLineChart
                      historySeries={forecast.history_series!}
                      forecast={forecast.forecast}
                      latestPrice={forecast.latest_price}
                      commodity={commodity}
                      direction={forecast.direction}
                    />
                  </div>
                )}

                {/* Day-card scrollable strip */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>
                    Daily forecast
                  </div>
                  <div className="pred-day-strip">
                    {forecast.forecast.map((point) => {
                      const diff = point.point - (forecast.latest_price ?? point.point);
                      const up   = diff >= 0;
                      const pctChange = forecast.latest_price
                        ? Math.abs((diff / forecast.latest_price) * 100)
                        : 0;
                      return (
                        <div key={point.date} style={{
                          padding: '12px 14px',
                          background: 'var(--bg3)',
                          borderRadius: 12,
                          border: `1px solid ${up ? 'rgba(76,175,80,.2)' : 'rgba(239,83,80,.15)'}`,
                          minWidth: 'min(140px, 42vw)',
                        }}>
                          <div style={{ fontSize: 10, color: 'var(--dim)', lineHeight: 1.4 }}>
                            {new Date(point.date).toLocaleDateString('en-IN', { weekday: 'short' })}
                            <br />
                            {new Date(point.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 'clamp(15px,3.5vw,18px)', fontFamily: 'Lora,serif', margin: '6px 0 3px', color: 'var(--text)' }}>
                            {fmtCurrency(point.point)}
                          </div>
                          <div style={{ fontSize: 12, color: up ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                            {up ? '↑' : '↓'} {pctChange.toFixed(1)}%
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 3 }}>
                            {fmtCurrency(point.lower)}–{fmtCurrency(point.upper)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Before you act */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, marginBottom: 10 }}>
                    Before you act
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {[
                      { title: 'Cross-check locally.', body: 'Agmarknet data can lag 24–48 hours. Call your nearest mandi before acting.' },
                      { title: 'Use the confidence band.', body: 'The shaded range in the chart shows uncertainty. Wider = less reliable.' },
                      { title: 'Research tool only.', body: 'Not financial advice. Consult a qualified market expert before trading decisions.' },
                    ].map((item) => (
                      <div key={item.title} style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, paddingLeft: 14, borderLeft: `2px solid ${tc}55` }}>
                        <strong style={{ color: 'var(--text)' }}>{item.title}</strong> {item.body}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <PredictorDisclaimer compact />
          </div>

          {/* ── Bottom info grid ──────────────────────────────── */}
          <div className="pred-bottom-grid">

            {/* Top markets with price bars */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>
                Top markets
              </div>
              {marketRows.length ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {marketRows.slice(0, 8).map((row) => {
                    const barPct = Math.round(((row.modal_price ?? 0) / maxMarketPrice) * 100);
                    return (
                      <div key={row.market}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>
                            {row.market}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--dim)', flexShrink: 0 }}>{row.district}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', flexShrink: 0 }}>
                            {fmtCurrency(row.modal_price)}
                          </div>
                        </div>
                        <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${barPct}%`, background: 'var(--green)', borderRadius: 99, opacity: 0.7 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>No market rows for this selection.</div>
              )}
            </div>

            {/* Data quality with visual */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>
                Data quality
              </div>
              {(() => {
                const dq = quality.data_quality;
                const missingPct = Math.round(dq.missing_ratio * 100);
                const realPct    = 100 - missingPct;
                const rating     = dq.missing_ratio > 0.4 || dq.real_days < 14
                  ? { label: 'Low',    color: 'var(--red)'   }
                  : dq.missing_ratio > 0.2 || dq.stale_days > 5
                    ? { label: 'Medium', color: 'var(--gold)'  }
                    : { label: 'High',   color: 'var(--green)' };
                return (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {/* Quality badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: rating.color, flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, fontSize: 14, color: rating.color }}>{rating.label} quality</span>
                    </div>
                    {/* Real vs missing bar */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--dim)', marginBottom: 5 }}>
                        <span>Real data</span>
                        <span>{dq.real_days} days ({realPct}%)</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${realPct}%`, background: rating.color, borderRadius: 99, opacity: 0.8 }} />
                      </div>
                    </div>
                    {/* Stats */}
                    {[
                      ['Missing days', dq.missing_days],
                      ['Outlier days', dq.outlier_days],
                      ['Stale runs',   dq.stale_days],
                    ].map(([label, val]) => (
                      <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                        <span style={{ color: 'var(--muted)' }}>{label}</span>
                        <span style={{ fontWeight: 600 }}>{val}</span>
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

            {/* Forecast drivers with animated bars */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>
                Forecast drivers
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {drivers.top_features.slice(0, 5).map((feature) => {
                  const barPct  = Math.round((feature.importance / maxDriverImp) * 100);
                  const dColor  = feature.direction === 'positive' ? 'var(--green)' : feature.direction === 'negative' ? 'var(--red)' : 'var(--gold)';
                  const dirIcon = feature.direction === 'positive' ? '↑' : feature.direction === 'negative' ? '↓' : '→';
                  return (
                    <div key={feature.feature_name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: 'var(--muted)', fontWeight: 500 }}>
                          {feature.feature_name.replace(/_/g, ' ')}
                        </span>
                        <span style={{ color: dColor, fontWeight: 700, fontSize: 11 }}>
                          {dirIcon} {(feature.importance * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${barPct}%`, background: dColor, borderRadius: 99, opacity: 0.75 }} />
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
