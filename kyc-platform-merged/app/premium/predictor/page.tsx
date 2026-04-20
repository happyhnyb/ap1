import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import type { Metadata } from 'next';
import { getEffectiveServerSession } from '@/lib/auth/current-user';
import PredictorPaywall from '@/components/predictor/PredictorPaywall';
import PredictorFilters from '@/components/predictor/PredictorFilters';
import ForecastLineChart from '@/components/predictor/ForecastLineChart';
import PredictorTabs from '@/components/predictor/PredictorTabs';
import AIAnalysisBar from '@/components/predictor/AIAnalysisBar';
import { canAccessPredictorRelease, getPredictorReleaseMode } from '@/lib/product/predictor';
import { buildSeedOptions, buildSeedSummary, getSeedRecords } from '@/lib/forecasting/data/seed';
import { fallbackForecastResponse } from '@/lib/forecasting/fallback';
import { buildOptions, buildSummary, filterRecords } from '@/lib/mandi/engine';
import { loadRecords } from '@/lib/forecasting/data/loader';
import { forecastingEngine } from '@/lib/forecasting/engine';

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

function buildMarketRows(records: Array<{
  market: string;
  state: string;
  district: string;
  modal_price: number | null;
  min_price: number | null;
  max_price: number | null;
}>) {
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
  if (smape == null) return { label: 'Unknown',  cls: 'pr-conf-low' };
  if (smape < 5)     return { label: 'High',     cls: 'pr-conf-high' };
  if (smape < 15)    return { label: 'Moderate', cls: 'pr-conf-medium' };
  return                    { label: 'Low',      cls: 'pr-conf-low' };
}

export default async function PredictorPage({ searchParams }: Props) {
  noStore();

  const session   = await getEffectiveServerSession();
  const mode      = getPredictorReleaseMode();
  const hasAccess = canAccessPredictorRelease(session);

  if (!session && mode === 'auth') redirect('/login?from=/premium/predictor');
  if (!hasAccess) return <PredictorPaywall />;

  // ── Resolve filters ────────────────────────────────────────────────────────
  const params = (await searchParams) ?? {};

  // Load live records (snapshots → Agmarknet), fall back to seed options
  let liveRecordsAll: Awaited<ReturnType<typeof loadRecords>> | null = null;
  try { liveRecordsAll = await loadRecords(); } catch { /* use seed */ }

  const seedOptions = buildSeedOptions();
  const liveOptions = liveRecordsAll?.records.length ? buildOptions(liveRecordsAll.records) : null;
  const options = (liveOptions?.commodities.length ?? 0) > 0 ? liveOptions! : seedOptions;

  const fallbackCommodity = 'Wheat';
  const fallbackState     = 'Madhya Pradesh';

  const reqCommodity   = first(params.commodity)?.trim();
  const reqState       = first(params.state)?.trim();
  const reqMarket      = first(params.market)?.trim();
  const hasMarketParam = first(params.market) !== undefined;
  const reqHorizon     = Number.parseInt(first(params.horizon) ?? '', 10);

  const commodity = reqCommodity || fallbackCommodity;
  const state     = reqState     || fallbackState;
  // Only offer markets that belong to the selected state
  const markets   = options.marketsByState[state] ?? [];
  const market    = hasMarketParam ? (reqMarket ?? '') : (markets[0] ?? '');
  const horizon   = Number.isFinite(reqHorizon) ? Math.min(14, Math.max(3, reqHorizon)) : 14;

  // ── Fetch data ──────────────────────────────────────────────────────────────
  const liveFilter = { commodity, state, district: '', market: market || '', variety: '', grade: '' };
  const liveRecords = liveRecordsAll?.records.length ? filterRecords(liveRecordsAll.records, liveFilter) : [];
  const seedRecords = getSeedRecords({ commodity, state, market: market || undefined });
  const recordsForView = liveRecords.length ? liveRecords : seedRecords;
  const summary = liveRecords.length
    ? buildSummary(liveRecords, liveRecordsAll?.fetchedAt ?? null)
    : buildSeedSummary({ commodity, state, market: market || undefined });
  const marketRows = buildMarketRows(recordsForView);

  const forecast = await forecastingEngine
    .forecast({ commodity, state, market: market || undefined, horizon })
    .catch(() => fallbackForecastResponse({ commodity, state, market: market || undefined, horizon }));

  const quality = {
    commodity,
    market: market || 'All',
    state,
    data_quality: {
      missing_ratio: forecast.meta.data_points > 0
        ? Math.max(0, (forecast.meta.data_points - forecast.meta.real_data_points) / forecast.meta.data_points)
        : 1,
      real_days: forecast.meta.real_data_points,
      stale_days: 0,
      missing_days: Math.max(0, forecast.meta.data_points - forecast.meta.real_data_points),
      outlier_days: forecast.explanation.anomaly_flags.filter((flag) => flag.type === 'outlier').length,
      date_range: forecast.history_series?.length
        ? [forecast.history_series[0].date, forecast.history_series.at(-1)!.date] as [string, string]
        : null,
    },
  };

  const drivers = {
    top_features: forecast.explanation.top_features,
    recent_error_band: forecast.explanation.recent_error_band,
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const tc          = trendColor(forecast.direction);
  const arrow       = forecast.direction === 'up' ? '↑' : forecast.direction === 'down' ? '↓' : '→';
  const smape       = forecast.meta.backtest.smape;
  const conf        = confidenceLevel(smape);
  const fresh       = dateFreshness(summary.latestArrivalDate);
  const isStale     = fresh.staleDays >= 3;
  const isVeryStale = fresh.staleDays >= 7;

  const maxMarketPrice = Math.max(...marketRows.map((r) => r.modal_price ?? 0), 1);
  const maxDriverImp   = Math.max(...drivers.top_features.map((f) => f.importance), 0.01);

  const endPoint  = forecast.forecast.at(-1);
  const endDate   = endPoint ? new Date(endPoint.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null;
  const endPrice  = endPoint ? fmt(endPoint.point) : null;
  const dataPoints = forecast.meta.data_points;
  const isFallbackModel = forecast.model_used.includes('fallback') || forecast.meta.model_type.includes('fallback');
  const latestBand = endPoint ? `${fmt(endPoint.lower)} - ${fmt(endPoint.upper)}` : null;

  let forecastText: string;
  if (forecast.insufficient) {
    forecastText = 'Not enough price data for this selection. Try All markets or a major hub.';
  } else if (forecast.direction === 'flat') {
    forecastText = `${dataPoints} days of data suggest limited movement (${Math.abs(forecast.trend_pct).toFixed(1)}%) with prices staying near ${fmt(forecast.latest_price)}/qtl.`;
  } else {
    const dir = forecast.direction === 'up' ? 'upward' : 'downward';
    forecastText = `${dataPoints} days of data point to a ${dir} move of ${Math.abs(forecast.trend_pct).toFixed(1)}%${endDate && endPrice ? `, with an estimated ${endDate} level near ${endPrice}` : ''}${latestBand ? ` and a model range of ${latestBand}` : ''}.`;
  }

  const filterOptions = {
    commodities:    options.commodities,
    states:         options.states,
    markets:        options.markets,
    marketsByState: options.marketsByState,
  };
  const filterCurrent = { commodity, state, market, horizon };

  return (
    <main className="pr-shell">

      {/* ── 1. Sticky context top bar ── */}
      <div className="pr-topbar">
        <div className="pr-topbar-left">
          <span className="pr-topbar-commodity">{commodity}</span>
          <span className="pr-topbar-sep" aria-hidden="true">·</span>
          <span className="pr-topbar-loc">{state}{market ? ` · ${market}` : ''}</span>
        </div>
        <a href="#pr-filters" className="pr-topbar-edit" aria-label="Edit filters">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
            <path d="M7.5 1.5 9.5 3.5 3.5 9.5H1.5v-2L7.5 1.5Z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round"/>
          </svg>
          Filters
        </a>
      </div>

      {/* ── 2. Stale banner — slim ── */}
      {isStale && (
        <div className="pr-stale">
          <span className={`pr-stale-dot${isVeryStale ? ' very-stale' : ''}`} />
          <span className="pr-stale-text">
            Data {fresh.staleDays}d old · Refreshes after midnight IST
          </span>
        </div>
      )}

      <div className="pr-layout">

        {/* ══ Main column ══════════════════════════════════════════════ */}
        <div className="pr-main">

          {/* ── Mobile filters — top of content so they're always reachable ── */}
          <section id="pr-filters" className="pr-mobile-filters">
            <PredictorFilters
              options={filterOptions}
              current={filterCurrent}
            />
          </section>

          {/* ── 3. Hero — price dominant, 2-row compact ── */}
          <div className="card-elevated pr-hero">
            <div className="pr-price-row">
              <span className="pr-price">{fmt(forecast.latest_price)}</span>
              <div className="pr-hero-chips">
                {!forecast.insufficient && (
                  <span className="pr-trend-chip" style={{ color: tc, borderColor: `${tc}55`, background: `${tc}0d` }}>
                    {arrow} {forecast.direction === 'flat' ? 'Stable' : `${Math.abs(forecast.trend_pct).toFixed(1)}%`}
                  </span>
                )}
                {smape != null && (
                  <span className={`pr-conf-chip ${conf.cls}`}>{conf.label}</span>
                )}
              </div>
            </div>

            <div className="pr-hero-foot">
              <div className="pr-hero-meta-line">
                <span className="pr-fresh-pill">
                  <span className={`pr-fresh-dot${fresh.cls ? ` ${fresh.cls}` : ''}`} />
                  {fresh.label}
                </span>
                <span className="pr-hero-sep" aria-hidden="true">·</span>
                <span className="pr-unit">/qtl{forecast.latest_date ? ` · ${forecast.latest_date}` : ''}</span>
                {smape != null && (
                  <>
                    <span className="pr-hero-sep" aria-hidden="true">·</span>
                    <span className="pr-smape">sMAPE {smape.toFixed(1)}%</span>
                  </>
                )}
              </div>
              <p className="pr-disclaimer">Research only · Not financial advice · Agmarknet data</p>
            </div>
          </div>

          {/* ── 4. Chart card ── */}
          <div className="card-elevated pr-chart-card">
            <div className="pr-chart-header">
              <span className="pr-chart-title">{horizon}-Day Forecast</span>
              {!forecast.insufficient && (
                <span className="pr-trend-badge" style={{ color: tc, borderColor: `${tc}44`, background: `${tc}10` }}>
                  {arrow} {forecast.direction === 'flat' ? 'Stable' : `${Math.abs(forecast.trend_pct).toFixed(1)}%`}
                </span>
              )}
            </div>

            {forecast.insufficient ? (
              <div className="notice notice-gold pr-narrative">{forecast.message}</div>
            ) : (
              <>
                {(forecast.history_series?.length ?? 0) > 0 && (
                  <ForecastLineChart
                    historySeries={forecast.history_series!}
                    forecast={forecast.forecast}
                    latestPrice={forecast.latest_price}
                    commodity={commodity}
                    direction={forecast.direction}
                  />
                )}

                <p className="pr-narrative" style={{ borderLeftColor: `${tc}55` }}>
                  {forecastText}
                </p>

                {isFallbackModel && (
                  <div className="notice notice-gold pr-narrative">
                    Fallback mode: this view is using a lighter forecast path because the full benchmarked model stack was unavailable for this request.
                  </div>
                )}

                <AIAnalysisBar
                  commodity={commodity}
                  state={state}
                  market={market || undefined}
                  horizon={horizon}
                />

                {/* ── 5. Forecast day strip ── */}
                <div className="pr-strip">
                  <div className="pr-strip-label">Daily breakdown</div>
                  <div className="pr-strip-scroll">
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
                            style={{ borderTopColor: up ? 'rgba(76,175,80,.4)' : 'rgba(239,83,80,.3)' }}
                          >
                            <div className="pr-day-header">
                              <span className="pr-day-name">{dayName}</span>
                              <span className="pr-day-date">{dateStr}</span>
                            </div>
                            <div className="pr-day-price">{fmt(pt.point)}</div>
                            <div className="pr-day-pct" style={{ color: up ? 'var(--green)' : 'var(--red)' }}>
                              {up ? '↑' : '↓'} {pct.toFixed(1)}%
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <details className="pr-guide">
                  <summary className="pr-guide-toggle">How to read this forecast</summary>
                  <div className="pr-guide-body">
                    <div className="pr-guide-item">
                      <strong>Model-based view, not certainty.</strong>{' '}
                      This uses the best-performing available forecast model for the selected mandi history and horizon. Sudden weather, policy, or supply shocks can still break the pattern.
                    </div>
                    <div className="pr-guide-item">
                      <strong>Use the range, not just the center line.</strong>{' '}
                      Wider bands mean lower certainty. For longer horizons, treat this as directional guidance rather than an exact price call.
                    </div>
                    <div className="pr-guide-item">
                      <strong>Check freshness before acting.</strong>{' '}
                      Confidence drops when data is stale, sparse, or imputed. Agmarknet can lag 24-48h, so confirm with your local mandi before any trading decision.
                    </div>
                  </div>
                </details>
              </>
            )}
          </div>

          {/* ── 6. Tabbed insights — markets / quality / drivers ── */}
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

        {/* ══ Desktop sidebar ══════════════════════════════════════════ */}
        <aside className="pr-sidebar">

          <div className="card pr-meta-card">
            <div className="pr-meta-title">Filters</div>
            <PredictorFilters
              options={filterOptions}
              current={filterCurrent}
              isSidebar
            />
          </div>

          <div className="card pr-meta-card">
            <div className="pr-meta-title">Data status</div>
            {([
              ['Records',     summary.recordsCount.toLocaleString()],
              ['Markets',     summary.marketsCount.toLocaleString()],
              ['States',      options.states.length.toLocaleString()],
              ['Latest data', summary.latestArrivalDate ?? '—'],
              ['Window',      summary.latestSnapshotDate ?? '—'],
              ['Model',       forecast.meta.model_description],
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
