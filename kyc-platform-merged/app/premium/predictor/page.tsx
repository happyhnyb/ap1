import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import type { Metadata } from 'next';
import { getEffectiveServerSession } from '@/lib/auth/current-user';
import PredictorPaywall from '@/components/predictor/PredictorPaywall';
import { PredictorDisclaimer } from '@/components/predictor/PredictorDisclaimer';
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

  const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((sum, n) => sum + n, 0) / arr.length) : null);

  return [...marketMap.entries()]
    .map(([market, row]) => ({
      market,
      state: row.state,
      district: row.district,
      modal_price: avg(row.modal),
      min_price: avg(row.min),
      max_price: avg(row.max),
    }))
    .filter((row) => row.modal_price !== null)
    .sort((a, b) => (b.modal_price ?? 0) - (a.modal_price ?? 0))
    .slice(0, 20);
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
  const requestedState = first(params.state)?.trim();
  const requestedMarket = first(params.market)?.trim();
  const requestedHorizon = Number.parseInt(first(params.horizon) ?? '', 10);

  const commodity = requestedCommodity && options.commodities.includes(requestedCommodity)
    ? requestedCommodity
    : fallbackCommodity;
  const state = requestedState && options.states.includes(requestedState)
    ? requestedState
    : fallbackState;
  const markets = state ? (options.marketsByState[state] ?? []) : options.markets;
  const market = requestedMarket && markets.includes(requestedMarket) ? requestedMarket : '';
  const horizon = Number.isFinite(requestedHorizon) ? Math.min(14, Math.max(3, requestedHorizon)) : 14;

  const filters = { commodity, state, market: market || undefined };
  const seedRecords = getSeedRecords(filters);
  const summary = buildSeedSummary(filters);
  const marketRows = buildMarketRows(seedRecords);
  const [forecast, quality, drivers] = await Promise.all([
    fallbackForecastResponse({ commodity, state, market: market || undefined, horizon }),
    fallbackQualityResponse({ commodity, state, market: market || undefined }),
    fallbackDriversResponse({ commodity, state, market: market || undefined, horizon }),
  ]);

  return (
    <main className="predictor-shell">
      <div style={{ paddingBottom: 18, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 className="serif" style={{ fontSize: 'clamp(20px,4vw,28px)', margin: 0 }}>⚡ Price Predictor</h1>
              <span className="badge badge-gold" style={{ fontSize: 10 }}>AI-assisted</span>
              <span
                className="badge"
                style={{
                  color: trendColor(forecast.direction),
                  borderColor: `${trendColor(forecast.direction)}44`,
                  background: `${trendColor(forecast.direction)}12`,
                  fontSize: 11,
                }}
              >
                {forecast.direction === 'up' ? '↑' : forecast.direction === 'down' ? '↓' : '→'} {Math.abs(forecast.trend_pct).toFixed(1)}%
              </span>
            </div>
            <p style={{ color: 'var(--muted)', margin: '6px 0 0', fontSize: 13 }}>
              Live Agmarknet data · model-based directional forecast · {horizon}-day horizon
            </p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 28, fontFamily: 'Lora,serif', fontWeight: 700, lineHeight: 1 }}>
              {fmtCurrency(forecast.latest_price)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>
              {forecast.latest_date || 'latest'} · {forecast.market}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <PredictorDisclaimer />
      </div>

      <div className="predictor-grid">
        <aside style={{ display: 'grid', gap: 12 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontFamily: 'Lora,serif', fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Filter data</div>
            <form method="get" style={{ display: 'grid', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Commodity</label>
                <select name="commodity" className="select" defaultValue={commodity}>
                  {options.commodities.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">State</label>
                <select name="state" className="select" defaultValue={state}>
                  {options.states.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Market</label>
                <select name="market" className="select" defaultValue={market}>
                  <option value="">All</option>
                  {markets.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Horizon</label>
                <select name="horizon" className="select" defaultValue={String(horizon)}>
                  {[3, 5, 7, 10, 14].map((days) => <option key={days} value={days}>{days} days</option>)}
                </select>
              </div>
              <button type="submit" className="btn btn-primary btn-full">Apply Filters</button>
            </form>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>
              Data status
            </div>
            {[
              ['Records', summary.recordsCount.toLocaleString()],
              ['Markets', summary.marketsCount.toLocaleString()],
              ['Latest data', summary.latestArrivalDate || '—'],
              ['Forecast model', forecast.model_used],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <span style={{ color: 'var(--muted)' }}>{label}</span>
                <span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
              </div>
            ))}
          </div>
        </aside>

        <div style={{ display: 'grid', gap: 16 }}>
          <div className="grid-3" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            {[
              { label: 'Modal Price', value: fmtCurrency(summary.avgModalPrice), color: 'var(--text)' },
              { label: 'Range', value: `${fmtCurrency(summary.avgMinPrice)} – ${fmtCurrency(summary.avgMaxPrice)}`, color: 'var(--muted)' },
              { label: 'Tracked Markets', value: summary.marketsCount.toLocaleString(), color: 'var(--green)' },
            ].map((item) => (
              <div key={item.label} className="card metric-card">
                <div className="metric-label">{item.label}</div>
                <div className="metric-val" style={{ color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div className="card-elevated" style={{ padding: '20px 22px', display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'Lora,serif', fontSize: 16, fontWeight: 600 }}>{horizon}-Day Forecast</span>
              <span
                className="badge"
                style={{
                  color: trendColor(forecast.direction),
                  borderColor: `${trendColor(forecast.direction)}44`,
                  background: `${trendColor(forecast.direction)}10`,
                  fontSize: 12,
                }}
              >
                {forecast.direction === 'up' ? '↑' : forecast.direction === 'down' ? '↓' : '→'} {forecast.direction === 'flat' ? 'Stable' : `${Math.abs(forecast.trend_pct).toFixed(1)}%`}
              </span>
              {forecast.meta.backtest.smape != null && (
                <span style={{ fontSize: 12, color: 'var(--dim)', marginLeft: 'auto' }}>
                  sMAPE {forecast.meta.backtest.smape.toFixed(1)}%
                </span>
              )}
            </div>

            {forecast.insufficient ? (
              <div className="notice notice-gold">{forecast.message || 'Insufficient history for this selection.'}</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Forecast</th>
                      <th>Lower</th>
                      <th>Upper</th>
                      <th>Vs now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.forecast.map((point) => {
                      const diff = point.point - (forecast.latest_price ?? point.point);
                      const up = diff >= 0;
                      return (
                        <tr key={point.date}>
                          <td>{new Date(point.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                          <td style={{ fontWeight: 600 }}>{fmtCurrency(point.point)}</td>
                          <td style={{ color: 'var(--dim)' }}>{fmtCurrency(point.lower)}</td>
                          <td style={{ color: 'var(--dim)' }}>{fmtCurrency(point.upper)}</td>
                          <td style={{ color: up ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>{up ? '+' : ''}{diff.toFixed(0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <PredictorDisclaimer compact />
          </div>

          <div className="grid-3" style={{ gridTemplateColumns: '1.2fr .8fr .8fr' }}>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>
                Top markets
              </div>
              {marketRows.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Market</th>
                        <th>District</th>
                        <th>Modal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketRows.slice(0, 8).map((row) => (
                        <tr key={row.market}>
                          <td style={{ fontWeight: 500 }}>{row.market}</td>
                          <td style={{ color: 'var(--muted)' }}>{row.district}</td>
                          <td style={{ color: 'var(--green)', fontWeight: 600 }}>{fmtCurrency(row.modal_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>No market rows for this selection.</div>
              )}
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>
                Data quality
              </div>
              <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                <div><strong>{quality.data_quality.real_days}</strong> real days</div>
                <div><strong>{(quality.data_quality.missing_ratio * 100).toFixed(0)}%</strong> missing ratio</div>
                <div><strong>{quality.data_quality.outlier_days}</strong> outlier days</div>
                <div><strong>{quality.data_quality.stale_days}</strong> stale runs</div>
                {quality.data_quality.date_range && (
                  <div style={{ color: 'var(--dim)', fontSize: 12 }}>
                    {quality.data_quality.date_range[0]} to {quality.data_quality.date_range[1]}
                  </div>
                )}
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>
                Forecast drivers
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {drivers.top_features.slice(0, 5).map((feature) => (
                  <div key={feature.feature_name} style={{ fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ color: 'var(--muted)' }}>{feature.feature_name.replace(/_/g, ' ')}</span>
                      <span style={{ fontWeight: 600 }}>{(feature.importance * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
                {drivers.recent_error_band != null && (
                  <div style={{ color: 'var(--dim)', fontSize: 12, marginTop: 4 }}>
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
