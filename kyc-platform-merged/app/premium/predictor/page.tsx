import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import type { Metadata } from 'next';
import { getEffectiveServerSession } from '@/lib/auth/current-user';
import PredictorPaywall from '@/components/predictor/PredictorPaywall';
import PredictorFilters from '@/components/predictor/PredictorFilters';
import ForecastLineChart from '@/components/predictor/ForecastLineChart';
import PredictorTabs from '@/components/predictor/PredictorTabs';
import { canAccessPredictorRelease, getPredictorReleaseMode } from '@/lib/product/predictor';
import { buildSeedOptions, buildSeedSummary, getSeedRecords, getSeedFetchedAt } from '@/lib/forecasting/data/seed';
import { fallbackForecastResponse, fallbackQualityResponse, fallbackDriversResponse } from '@/lib/forecasting/fallback';

export const metadata: Metadata = {
  title: 'Price Predictor | KYC Agri',
  description: 'Statistical commodity price forecast based on Agmarknet mandi data. Research tool only — not financial advice.',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function fmt(value: number | null) {
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

function dateFreshness(isoDate: string | null): { label: string; staleDays: number; cls: string } {
  if (!isoDate) return { label: 'Unknown', staleDays: 999, cls: 'very-stale' };
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
  if (days <= 1) return { label: 'Today',        staleDays: days, cls: '' };
  if (days <= 7) return { label: `${days}d ago`, staleDays: days, cls: 'stale' };
  return               { label: `${days}d ago`, staleDays: days, cls: 'very-stale' };
}

function confidenceLevel(smape: number | null): { label: string; cls: string } {
  if (smape == null) return { label: 'Unknown',  cls: 'p-conf-low' };
  if (smape < 5)     return { label: 'High',     cls: 'p-conf-high' };
  if (smape < 15)    return { label: 'Moderate', cls: 'p-conf-medium' };
  return                    { label: 'Low',      cls: 'p-conf-low' };
}

export default async function PredictorPage({ searchParams }: Props) {
  noStore();

  const session    = await getEffectiveServerSession();
  const mode       = getPredictorReleaseMode();
  const hasAccess  = canAccessPredictorRelease(session);

  if (!session && mode === 'auth') redirect('/login?from=/premium/predictor');
  if (!hasAccess) return <PredictorPaywall />;

  // ── Resolve filters ───────────────────────────────────────────────────────
  const params  = (await searchParams) ?? {};
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

  // ── Fetch data ─────────────────────────────────────────────────────────────
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

  // ── Derived values ─────────────────────────────────────────────────────────
  const tc      = trendColor(forecast.direction);
  const arrow   = forecast.direction === 'up' ? '↑' : forecast.direction === 'down' ? '↓' : '→';
  const smape   = forecast.meta.backtest.smape;
  const conf    = confidenceLevel(smape);
  const fresh   = dateFreshness(summary.latestArrivalDate);
  const isStale = fresh.staleDays >= 3;
  const isVeryStale = fresh.staleDays >= 7;

  const maxMarketPrice = Math.max(...marketRows.map((r) => r.modal_price ?? 0), 1);
  const maxDriverImp   = Math.max(...drivers.top_features.map((f) => f.importance), 0.01);

  const endPoint  = forecast.forecast.at(-1);
  const endDate   = endPoint ? new Date(endPoint.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null;
  const endPrice  = endPoint ? fmt(endPoint.point) : null;
  const dataPoints = forecast.meta.data_points;

  let forecastText: string;
  if (forecast.insufficient) {
    forecastText = 'Not enough price data for this selection. Try All markets or a major hub.';
  } else if (forecast.direction === 'flat') {
    forecastText = `${commodity} prices appear stable across ${dataPoints} days of Agmarknet data. The model projects minimal movement (${Math.abs(forecast.trend_pct).toFixed(1)}%) over ${horizon} days near ${fmt(forecast.latest_price)}/qtl.${smape != null ? ` Backtest error: ~${smape.toFixed(1)}% sMAPE.` : ''}`;
  } else {
    const dir = forecast.direction === 'up' ? 'upward' : 'downward';
    forecastText = `${dataPoints} days of data show a ${dir} trend of ${Math.abs(forecast.trend_pct).toFixed(1)}%${endDate && endPrice ? `, reaching ~${endPrice} by ${endDate}` : ''}.${smape != null ? ` Backtest error: ~${smape.toFixed(1)}% sMAPE.` : ''} Statistical extrapolation — not a guaranteed outcome.`;
  }

  return (
    <main className="pr-shell">

      {/* ── Filter bar (full width, always visible) ── */}
      <PredictorFilters
        options={{
          commodities:    options.commodities,
          states:         options.states,
          markets:        options.markets,
          marketsByState: options.marketsByState,
        }}
        current={{ commodity, state, market, horizon }}
      />

      {/* ── Stale banner ── */}
      {isStale && (
        <div className="pr-stale">
          <span className="pr-stale-icon">{isVeryStale ? '⛔' : '⚠️'}</span>
          <span>
            <strong>Data is {fresh.staleDays} days old.</strong>
            {' '}Agmarknet updates daily — refresh runs after midnight IST.
            {isVeryStale ? ' Forecast accuracy may be reduced.' : ''}
          </span>
        </div>
      )}

      <div className="pr-layout">

        {/* ══ MAIN COLUMN ══════════════════════════════════════════════════ */}
        <div className="pr-main">

          {/* ── Hero card: commodity + price + trend + freshness ── */}
          <div className="card pr-hero">
            <div className="pr-hero-top">
              <div className="pr-hero-commodity">{commodity}</div>
              <div className="pr-hero-meta">
                {state}{market ? ` · ${market}` : ''} &nbsp;·&nbsp; {horizon}-day forecast
              </div>
            </div>

            <div className="pr-hero-mid">
              <div className="pr-hero-price-block">
                <span className="pr-hero-label">Current price</span>
                <span className="pr-hero-price" style={{ color: tc }}>
                  {fmt(forecast.latest_price)}
                </span>
                <span className="pr-hero-unit">/ quintal</span>
              </div>

              <div className="pr-hero-stats">
                {!forecast.insufficient && (
                  <div className="pr-stat">
                    <span className="pr-stat-label">Trend</span>
                    <span className="pr-stat-val" style={{ color: tc }}>
                      {arrow} {forecast.direction === 'flat' ? 'Stable' : `${Math.abs(forecast.trend_pct).toFixed(1)}%`}
                    </span>
                  </div>
                )}
                <div className="pr-stat">
                  <span className="pr-stat-label">Confidence</span>
                  <span className={`pr-conf ${conf.cls}`}>{conf.label}</span>
                </div>
                <div className="pr-stat">
                  <span className="pr-stat-label">Data</span>
                  <span className="pr-stat-val">
                    <span className={`pr-fresh-dot${fresh.cls ? ` ${fresh.cls}` : ''}`} />
                    {fresh.label}
                  </span>
                </div>
              </div>
            </div>

            <div className="pr-hero-foot">
              <span className="pr-disclaimer">Research tool only · Not financial advice · Agmarknet data</span>
              {smape != null && (
                <span className="pr-smape">sMAPE {smape.toFixed(1)}%</span>
              )}
            </div>
          </div>

          {/* ── Forecast chart + day strip card ── */}
          <div className="card-elevated pr-forecast">

            <div className="pr-section-head">
              <span className="pr-section-title">{horizon}-Day Forecast</span>
              <span className="pr-trend-badge" style={{ color: tc, borderColor: `${tc}44`, background: `${tc}10` }}>
                {arrow} {forecast.direction === 'flat' ? 'Stable' : `${Math.abs(forecast.trend_pct).toFixed(1)}%`}
              </span>
            </div>

            {forecast.insufficient ? (
              <div className="notice notice-gold">{forecast.message}</div>
            ) : (
              <>
                {/* Forecast narrative — collapsible on mobile */}
                <p className="pr-narrative" style={{ borderLeftColor: `${tc}55` }}>
                  {forecastText}
                </p>

                {/* Chart */}
                {(forecast.history_series?.length ?? 0) > 0 && (
                  <ForecastLineChart
                    historySeries={forecast.history_series!}
                    forecast={forecast.forecast}
                    latestPrice={forecast.latest_price}
                    commodity={commodity}
                    direction={forecast.direction}
                  />
                )}

                {/* Day strip */}
                <div className="pr-days-section">
                  <div className="pr-days-label">Daily breakdown</div>
                  <div className="pr-days-scroll">
                    <div className="pr-days">
                      {forecast.forecast.map((pt) => {
                        const diff = pt.point - (forecast.latest_price ?? pt.point);
                        const up   = diff >= 0;
                        const pct  = forecast.latest_price
                          ? Math.abs((diff / forecast.latest_price) * 100) : 0;
                        const dayName = new Date(pt.date).toLocaleDateString('en-IN', { weekday: 'short' });
                        const dateStr = new Date(pt.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                        return (
                          <div
                            key={pt.date}
                            className="pr-day"
                            style={{ borderTopColor: up ? 'rgba(76,175,80,.35)' : 'rgba(239,83,80,.25)' }}
                          >
                            <div className="pr-day-header">
                              <span className="pr-day-name">{dayName}</span>
                              <span className="pr-day-date">{dateStr}</span>
                            </div>
                            <div className="pr-day-price">{fmt(pt.point)}</div>
                            <div className="pr-day-pct" style={{ color: up ? 'var(--green)' : 'var(--red)' }}>
                              {up ? '↑' : '↓'} {pct.toFixed(1)}%
                            </div>
                            <div className="pr-day-range">{fmt(pt.lower)}–{fmt(pt.upper)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* How to read */}
                <details className="pr-guide">
                  <summary className="pr-guide-toggle">How to read this forecast</summary>
                  <div className="pr-guide-body">
                    <div className="pr-guide-item">
                      <strong>Trend extrapolation, not prediction.</strong>
                      {' '}Holt&rsquo;s double exponential smoothing on Agmarknet prices. Cannot predict weather, policy, or supply shocks.
                    </div>
                    <div className="pr-guide-item">
                      <strong>Wider band = more uncertainty.</strong>
                      {' '}By day {horizon}, treat as directional guidance only.
                    </div>
                    <div className="pr-guide-item">
                      <strong>Verify before acting.</strong>
                      {' '}Agmarknet can lag 24–48h. Confirm with your local mandi before any trading decision.
                    </div>
                  </div>
                </details>
              </>
            )}
          </div>

          {/* ── Analysis tabs: markets / quality / drivers ── */}
          <PredictorTabs
            commodity={commodity}
            marketRows={marketRows}
            maxMarketPrice={maxMarketPrice}
            quality={quality.data_quality}
            drivers={drivers.top_features}
            maxDriverImp={maxDriverImp}
            recentErrorBand={drivers.recent_error_band ?? null}
          />

        </div>

        {/* ══ META COLUMN (desktop only) ═══════════════════════════════════ */}
        <aside className="pr-meta">
          <div className="card pr-meta-card">
            <div className="pr-meta-title">Data status</div>
            {([
              ['Records',     summary.recordsCount.toLocaleString()],
              ['Markets',     summary.marketsCount.toLocaleString()],
              ['States',      options.states.length.toLocaleString()],
              ['Latest data', summary.latestArrivalDate ?? '—'],
              ['Window',      fetchedAt.slice(0, 10)],
              ['Model',       'Holt smoothing'],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="pr-meta-row">
                <span className="pr-meta-lbl">{label}</span>
                <span className="pr-meta-val">{value}</span>
              </div>
            ))}
            {smape != null && (
              <div className="pr-meta-smape">Backtest: ~{smape.toFixed(1)}% sMAPE</div>
            )}
          </div>
        </aside>

      </div>
    </main>
  );
}
