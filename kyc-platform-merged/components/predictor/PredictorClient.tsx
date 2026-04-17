'use client';

import { useState } from 'react';
import Link from 'next/link';
import PriceChart, { type MarketPoint } from './PriceChart';
import ForecastLineChart from './ForecastLineChart';
import { PredictorAIExplain } from './PredictorAIExplain';
import { PredictorDisclaimer } from './PredictorDisclaimer';

interface MandiOptions {
  commodities: string[];
  states:      string[];
  markets:     string[];
  districts:   string[];
  marketsByState:   Record<string, string[]>;
  districtsByState: Record<string, string[]>;
}

interface Summary {
  latestSnapshotDate: string | null;
  latestArrivalDate:  string | null;
  recordsCount:  number;
  marketsCount:  number;
  avgModalPrice: number | null;
  avgMinPrice:   number | null;
  avgMaxPrice:   number | null;
  topMarkets: {
    market: string; district: string; state: string;
    modal_price: number | null; min_price: number | null; max_price: number | null; arrival_date: string;
  }[];
}

interface ForecastMeta {
  model_type: string;
  model_description: string;
  data_points: number;
  real_data_points: number;
  has_synthetic_data: boolean;
  backtest: {
    mae: number | null;
    wape: number | null;
    smape: number | null;
    directional_accuracy: number | null;
    ci_coverage: number | null;
    n_test_points: number;
  };
  disclaimer: string;
}

interface ForecastResult {
  commodity: string;
  commodity_id: string;
  market: string;
  mandi_id: string;
  state: string;
  latest_price: number | null;
  latest_date: string | null;
  history_series?: { date: string; price: number }[];
  forecast: { date: string; horizon_days: number; point: number; lower: number; upper: number }[];
  direction: 'up' | 'down' | 'flat';
  trend_pct: number;
  model_used: string;
  insufficient: boolean;
  message?: string;
  meta: ForecastMeta;
  explanation: {
    model_family: string;
    recent_error_band: number | null;
    top_features: { feature_name: string; importance: number; direction: 'positive' | 'negative' | 'mixed' }[];
    anomaly_flags: { type: string; date: string; description: string }[];
  };
}

interface QualityResult {
  commodity: string;
  market: string;
  state: string;
  data_quality: {
    total_days: number;
    real_days: number;
    missing_days: number;
    outlier_days: number;
    stale_days: number;
    zero_days: number;
    imputed_days: number;
    missing_ratio: number;
    date_range: [string, string] | null;
  };
  backtest_by_model: Record<string, {
    mae: number | null;
    wape: number | null;
    smape: number | null;
    directional_accuracy: number | null;
    ci_coverage: number | null;
    n_test_points: number;
  }>;
  recommended_model: string;
  warnings: string[];
}

interface DriversResult {
  commodity: string;
  market: string;
  state: string;
  model_used: string;
  top_features: { feature_name: string; importance: number; direction: 'positive' | 'negative' | 'mixed' }[];
  anomaly_flags: { type: string; date: string; description: string }[];
  recent_error_band: number | null;
}

function fmt(n: number | null) {
  if (n === null) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function fmtLabel(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function qualityRating(q: QualityResult['data_quality']): { label: string; color: string } {
  if (q.missing_ratio > 0.4 || q.real_days < 14) return { label: 'Low quality',    color: 'var(--red)'   };
  if (q.missing_ratio > 0.2 || q.stale_days > 5)  return { label: 'Medium quality', color: 'var(--gold)'  };
  return                                                   { label: 'High quality',  color: 'var(--green)' };
}

// ── Drivers bar panel ────────────────────────────────────────────────────────
function DriversPanel({ drivers }: { drivers: DriversResult }) {
  if (!drivers.top_features.length) return null;

  const maxImp = Math.max(...drivers.top_features.map((f) => f.importance), 0.01);

  const dirColor = (d: 'positive' | 'negative' | 'mixed') =>
    d === 'positive' ? 'var(--green)' : d === 'negative' ? 'var(--red)' : 'var(--muted)';

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600 }}>
        Top forecast drivers
      </div>
      {drivers.top_features.slice(0, 6).map((f) => (
        <div key={f.feature_name} style={{ display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{fmtLabel(f.feature_name)}</span>
            <span style={{ color: dirColor(f.direction), fontWeight: 600 }}>
              {(f.importance * 100).toFixed(1)}%
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: `${(f.importance / maxImp) * 100}%`,
              background: dirColor(f.direction),
              opacity: 0.8,
              transition: 'width .4s ease',
            }} />
          </div>
        </div>
      ))}

      {!!drivers.anomaly_flags.length && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 8 }}>
            Anomaly flags
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {drivers.anomaly_flags.slice(0, 4).map((flag) => (
              <div key={`${flag.type}-${flag.date}`} className="notice notice-gold" style={{ padding: '8px 12px', fontSize: 12 }}>
                <strong>{flag.date}</strong>: {flag.description}
              </div>
            ))}
          </div>
        </div>
      )}

      {drivers.recent_error_band != null && (
        <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
          Recent error band: ±{drivers.recent_error_band.toFixed(1)}%
        </div>
      )}
    </div>
  );
}

// ── Data quality panel ───────────────────────────────────────────────────────
function QualityPanel({ quality, forecast }: { quality: QualityResult; forecast: ForecastResult | null }) {
  const { data_quality: dq, warnings } = quality;
  const rating = qualityRating(dq);
  const smape  = forecast?.meta?.backtest?.smape ?? null;
  const da     = forecast?.meta?.backtest?.directional_accuracy ?? null;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Quality badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: rating.color, flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: rating.color }}>{rating.label}</div>
          <div style={{ fontSize: 12, color: 'var(--dim)' }}>
            {dq.real_days} real days · {(dq.missing_ratio * 100).toFixed(0)}% missing
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
        {[
          { label: 'Real days',      val: dq.real_days.toString()   },
          { label: 'Missing',        val: dq.missing_days.toString() },
          { label: 'Outlier days',   val: dq.outlier_days.toString() },
          { label: 'Stale runs',     val: dq.stale_days.toString()   },
          { label: 'sMAPE backtest', val: smape != null ? `${smape.toFixed(1)}%` : '—' },
          { label: 'Dir. accuracy',  val: da    != null ? `${(da * 100).toFixed(0)}%` : '—' },
        ].map(({ label, val }) => (
          <div key={label} style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{label}</div>
            <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'Lora,serif' }}>{val}</div>
          </div>
        ))}
      </div>

      {warnings.length > 0 && (
        <div className="notice notice-gold" style={{ fontSize: 12, padding: '10px 14px' }}>
          {warnings.join(' ')}
        </div>
      )}

      {dq.date_range && (
        <div style={{ fontSize: 11, color: 'var(--dim)' }}>
          Data range: {dq.date_range[0]} → {dq.date_range[1]}
        </div>
      )}
    </div>
  );
}

export default function PredictorClient({
  initialOptions = null,
  initialCommodity = 'Wheat',
  initialState = '',
  initialMarket = '',
  initialHorizon = 14,
  initialSummary = null,
  initialHistory = [],
  initialForecast = null,
  initialQuality = null,
  initialDrivers = null,
}: {
  initialOptions?: MandiOptions | null;
  initialCommodity?: string;
  initialState?: string;
  initialMarket?: string;
  initialHorizon?: number;
  initialSummary?: Summary | null;
  initialHistory?: MarketPoint[];
  initialForecast?: ForecastResult | null;
  initialQuality?: QualityResult | null;
  initialDrivers?: DriversResult | null;
}) {
  const [options]    = useState<MandiOptions | null>(initialOptions);
  const [commodity,  setCommodity]  = useState(initialCommodity);
  const [state,      setState]      = useState(initialState);
  const [market,     setMarket]     = useState(initialMarket);
  const [horizon,    setHorizon]    = useState(initialHorizon);
  const summary = initialSummary;
  const history = initialHistory;
  const forecast = initialForecast;
  const quality = initialQuality;
  const drivers = initialDrivers;
  const [tab,        setTab]        = useState<'chart' | 'markets' | 'forecast' | 'drivers' | 'quality'>('chart');

  const availableMarkets = state && options?.marketsByState?.[state]
    ? options.marketsByState[state]
    : (options?.markets ?? []);

  const dirColor = forecast
    ? forecast.direction === 'up' ? 'var(--green)' : forecast.direction === 'down' ? 'var(--red)' : 'var(--muted)'
    : 'var(--muted)';

  const dirArrow = forecast
    ? forecast.direction === 'up' ? '↑' : forecast.direction === 'down' ? '↓' : '→'
    : '';

  return (
    <main className="predictor-shell">

      {/* ── Page header ─────────────────────────────────────── */}
      <div style={{ paddingBottom: 18, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 className="serif" style={{ fontSize: 'clamp(20px,4vw,28px)', margin: 0 }}>
                ⚡ Price Predictor
              </h1>
              <span className="badge badge-gold" style={{ fontSize: 9 }}>AI-assisted</span>
              {forecast && !forecast.insufficient && (
                <span className="badge" style={{ color: dirColor, borderColor: dirColor + '44', background: dirColor + '12', fontSize: 11 }}>
                  {dirArrow} {Math.abs(forecast.trend_pct).toFixed(1)}%
                </span>
              )}
            </div>
            <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 13 }}>
              Live Agmarknet data · model-based directional forecast · {horizon}-day horizon
            </p>
          </div>

          {/* Hero price */}
          {forecast && forecast.latest_price && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 28, fontFamily: 'Lora,serif', fontWeight: 700, lineHeight: 1 }}>
                {fmt(forecast.latest_price)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>
                {forecast.latest_date || 'latest'} · {forecast.market}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <PredictorDisclaimer />
      </div>

      <div className="predictor-grid">
        {/* ── Sidebar ─────────────────────────────────────────── */}
        <aside style={{ display: 'grid', gap: 12 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontFamily: 'Lora,serif', fontSize: 15, fontWeight: 600, marginBottom: 14, color: 'var(--text)' }}>
              Filter data
            </div>

            <form method="get">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Commodity</label>
                <select name="commodity" className="select" value={commodity} onChange={(e) => { setCommodity(e.target.value); setMarket(''); }}>
                  {(options?.commodities.length
                    ? options.commodities
                    : ['Wheat', 'Onion', 'Tomato', 'Soybean', 'Cotton', 'Rice', 'Maize']
                  ).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">State</label>
                <select name="state" className="select" value={state} onChange={(e) => { setState(e.target.value); setMarket(''); }}>
                  <option value="">All States</option>
                  {(options?.states ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Market{state && <span style={{ color: 'var(--dim)', fontWeight: 400, marginLeft: 4, fontSize: 10 }}>({state})</span>}
                </label>
                <select name="market" className="select" value={market} onChange={(e) => setMarket(e.target.value)}>
                  <option value="">All</option>
                  {availableMarkets.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Horizon</label>
                <select name="horizon" className="select" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
                  {[3, 5, 7, 10, 14].map((d) => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-full">
              Apply Filters
            </button>
            </form>
          </div>

          {/* Model info */}
          {forecast && (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>
                Forecast model
              </div>
              <div style={{ fontFamily: 'Lora,serif', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                {forecast.model_used}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                {forecast.meta.data_points} data points
              </div>
              {forecast.meta.backtest.smape != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                  <span style={{ color: 'var(--dim)' }}>sMAPE backtest</span>
                  <span style={{ fontWeight: 600 }}>{forecast.meta.backtest.smape.toFixed(1)}%</span>
                </div>
              )}
              {forecast.meta.backtest.directional_accuracy != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                  <span style={{ color: 'var(--dim)' }}>Dir. accuracy</span>
                  <span style={{ fontWeight: 600 }}>{(forecast.meta.backtest.directional_accuracy * 100).toFixed(0)}%</span>
                </div>
              )}
            </div>
          )}

          {/* Data status */}
          {summary && (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>
                Data Status
              </div>
              {[
                ['Records',     summary.recordsCount.toLocaleString()],
                ['Markets',     summary.marketsCount.toLocaleString()],
                ['Latest data', summary.latestArrivalDate || '—'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted)' }}>{k}</span>
                  <span style={{ fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
          )}

          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>
              Related Analysis
            </div>
            <Link href={`/search?q=${encodeURIComponent(commodity)}`} className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}>
              Search &ldquo;{commodity}&rdquo; →
            </Link>
          </div>
        </aside>

        {/* ── Main panel ──────────────────────────────────────── */}
        <div style={{ display: 'grid', gap: 16 }}>

          {/* ── Metric row ──────────────────────────────────── */}
          {summary && (
            <div className="grid-3" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              {[
                { label: 'Modal Price',    val: fmt(summary.avgModalPrice), color: 'var(--text)'  },
                { label: 'Price Range',    val: `${fmt(summary.avgMinPrice)} – ${fmt(summary.avgMaxPrice)}`, color: 'var(--muted)' },
                { label: 'Mkt Tracked',   val: summary.marketsCount.toLocaleString(),  color: 'var(--green)' },
              ].map((m) => (
                <div key={m.label} className="card metric-card">
                  <div className="metric-label">{m.label}</div>
                  <div className="metric-val" style={{ color: m.color }}>{m.val}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Forecast banner ─────────────────────────────── */}
          {forecast && !forecast.insufficient && (
            <div className="card-elevated" style={{ padding: '20px 22px', display: 'grid', gap: 20 }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'Lora,serif', fontSize: 16, fontWeight: 600 }}>
                  {horizon}-Day Forecast
                </span>
                <span className="badge" style={{ color: dirColor, borderColor: dirColor + '44', background: dirColor + '10', fontSize: 12 }}>
                  {dirArrow} {forecast.direction === 'flat' ? 'Stable' : `${Math.abs(forecast.trend_pct).toFixed(1)}%`}
                </span>
                {forecast.meta?.backtest.smape != null && (
                  <span style={{ fontSize: 12, color: 'var(--dim)', marginLeft: 'auto' }}>
                    sMAPE {forecast.meta.backtest.smape.toFixed(1)}%
                  </span>
                )}
              </div>

              {/* Plain-English summary */}
              <div style={{ padding: '14px 16px', background: 'var(--bg3)', borderRadius: 10, border: `1px solid ${dirColor}33` }}>
                <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, marginBottom: 6 }}>
                  What the model says
                </div>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>
                  {forecast.direction === 'flat'
                    ? `${forecast.commodity} prices appear stable. The model projects minimal movement over the next ${horizon} days, staying near the current ₹${(forecast.latest_price ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}/quintal.`
                    : `The model projects a ${forecast.direction === 'up' ? 'rise' : 'fall'} of ${Math.abs(forecast.trend_pct).toFixed(1)}% for ${forecast.commodity} over the next ${horizon} days`
                      + (forecast.forecast.at(-1) ? ` — reaching an estimated ₹${forecast.forecast.at(-1)!.point.toLocaleString('en-IN', { maximumFractionDigits: 0 })}/quintal by ${new Date(forecast.forecast.at(-1)!.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.` : '.')
                  }
                  {forecast.meta?.backtest.smape != null && ` Historical error (sMAPE): ${forecast.meta.backtest.smape.toFixed(1)}%.`}
                </p>
              </div>

              {/* Time-series line chart */}
              {(forecast.history_series?.length ?? 0) > 0 && (
                <ForecastLineChart
                  historySeries={forecast.history_series ?? []}
                  forecast={forecast.forecast}
                  latestPrice={forecast.latest_price}
                  commodity={forecast.commodity}
                  direction={forecast.direction}
                />
              )}

              {/* Day-cell grid */}
              <div className="grid-3" style={{ gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                {forecast.forecast.slice(0, 6).map((f) => {
                  const diff = f.point - (forecast.latest_price ?? f.point);
                  const up   = diff >= 0;
                  return (
                    <div key={f.date} style={{ padding: '12px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 4 }}>
                        {new Date(f.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 16, fontFamily: 'Lora,serif' }}>{fmt(f.point)}</div>
                      <div style={{ fontSize: 11, marginTop: 3 }}>
                        <span style={{ color: up ? 'var(--green)' : 'var(--red)' }}>
                          {up ? '↑' : '↓'}{Math.abs(diff / (forecast.latest_price ?? f.point) * 100).toFixed(1)}%
                        </span>
                        <span style={{ color: 'var(--dim)', marginLeft: 4 }}>
                          {fmt(f.lower)}–{fmt(f.upper)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Before you act */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, marginBottom: 10 }}>
                  Before you act
                </div>
                <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'grid', gap: 6 }}>
                  <li style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--text)' }}>Cross-check locally.</strong> Agmarknet data can have a 24–48 hour lag. Call your nearest mandi or check with a commission agent before acting on this forecast.
                  </li>
                  <li style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--text)' }}>Use the confidence band.</strong> The shaded range (lower–upper) reflects model uncertainty. Wider bands mean less certainty — factor that into any decision.
                  </li>
                  <li style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--text)' }}>This is a research tool, not financial advice.</strong> Do not base sole trading or storage decisions on this forecast. Consult a qualified agricultural market expert.
                  </li>
                </ul>
              </div>

              <PredictorDisclaimer compact />
            </div>
          )}

          {/* ── Tab panel ───────────────────────────────────── */}
          <div className="card-elevated" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(
                [
                  { id: 'chart',    label: 'Market Prices'    },
                  { id: 'markets',  label: 'Top Markets'      },
                  { id: 'forecast', label: 'Full Forecast'    },
                  { id: 'drivers',  label: 'Drivers'          },
                  { id: 'quality',  label: 'Data Quality'     },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className="btn btn-sm"
                  style={{
                    background:   tab === id ? 'var(--bg4)' : 'transparent',
                    border:       tab === id ? '1px solid var(--border2)' : '1px solid transparent',
                    color:        tab === id ? 'var(--text)' : 'var(--muted)',
                    fontSize: 12,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={{ padding: 20, minHeight: 300 }}>

              {/* Market prices chart */}
              {tab === 'chart' && (
                history.length > 0 ? (
                  <PriceChart data={history} commodity={commodity} />
                ) : (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
                    No price data. Try a broader filter.
                  </div>
                )
              )}

              {/* Top markets table */}
              {tab === 'markets' && (
                summary?.topMarkets?.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Market</th><th>District</th><th>State</th>
                          <th>Modal</th><th>Range</th><th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.topMarkets.map((m, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 500 }}>{m.market}</td>
                            <td style={{ color: 'var(--muted)' }}>{m.district}</td>
                            <td style={{ color: 'var(--muted)' }}>{m.state}</td>
                            <td style={{ color: 'var(--green)', fontWeight: 600 }}>{fmt(m.modal_price)}</td>
                            <td style={{ color: 'var(--dim)', fontSize: 12 }}>{fmt(m.min_price)}–{fmt(m.max_price)}</td>
                            <td style={{ color: 'var(--dim)', fontSize: 12 }}>{m.arrival_date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
                    No market data available.
                  </div>
                )
              )}

              {/* Full forecast table */}
              {tab === 'forecast' && (
                forecast ? (
                  forecast.insufficient ? (
                    <div className="notice notice-gold">{forecast.message || 'Insufficient data. Need at least 7 days of price history.'}</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 20 }}>
                      {/* Key stats */}
                      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                        {[
                          { label: 'Current price', val: fmt(forecast.latest_price), color: 'var(--text)' },
                          { label: `${horizon}-day trend`, val: `${forecast.direction === 'up' ? '+' : ''}${forecast.trend_pct.toFixed(1)}%`, color: dirColor },
                          ...(forecast.meta?.backtest.smape != null ? [{ label: 'sMAPE', val: `${forecast.meta.backtest.smape.toFixed(1)}%`, color: 'var(--text)' }] : []),
                        ].map((s) => (
                          <div key={s.label}>
                            <div style={{ color: 'var(--dim)', fontSize: 12 }}>{s.label}</div>
                            <div style={{ fontWeight: 700, fontSize: 22, fontFamily: 'Lora,serif', color: s.color }}>{s.val}</div>
                          </div>
                        ))}
                      </div>

                      {/* Time-series chart in full-forecast tab */}
                      {(forecast.history_series?.length ?? 0) > 0 && (
                        <ForecastLineChart
                          historySeries={forecast.history_series ?? []}
                          forecast={forecast.forecast}
                          latestPrice={forecast.latest_price}
                          commodity={forecast.commodity}
                          direction={forecast.direction}
                        />
                      )}

                      {/* Forecast table */}
                      <div className="table-wrap">
                        <table className="table">
                          <thead>
                            <tr><th>Date</th><th>Forecast</th><th>Lower</th><th>Upper</th><th>Vs now</th></tr>
                          </thead>
                          <tbody>
                            {forecast.forecast.map((f) => {
                              const diff = f.point - (forecast.latest_price ?? f.point);
                              const up   = diff >= 0;
                              return (
                                <tr key={f.date}>
                                  <td>{new Date(f.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                                  <td style={{ fontWeight: 600 }}>{fmt(f.point)}</td>
                                  <td style={{ color: 'var(--dim)' }}>{fmt(f.lower)}</td>
                                  <td style={{ color: 'var(--dim)' }}>{fmt(f.upper)}</td>
                                  <td style={{ color: up ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
                                    {up ? '+' : ''}{diff.toFixed(0)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <PredictorAIExplain
                        commodity={commodity}
                        state={state || undefined}
                        market={market || undefined}
                        horizon={horizon}
                      />

                      <PredictorDisclaimer compact />

                      <p style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.6 }}>
                        {forecast.meta.model_description} · {forecast.meta.data_points} daily points ·
                        Use as a research aid, not a sole decision tool.
                      </p>
                    </div>
                  )
                ) : (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
                    No forecast for this selection.
                  </div>
                )
              )}

              {/* Drivers panel */}
              {tab === 'drivers' && (
                drivers ? (
                  <DriversPanel drivers={drivers} />
                ) : (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
                    No driver data for this selection.
                  </div>
                )
              )}

              {/* Quality panel */}
              {tab === 'quality' && (
                quality ? (
                  <QualityPanel quality={quality} forecast={forecast} />
                ) : (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
                    No quality data for this selection.
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
