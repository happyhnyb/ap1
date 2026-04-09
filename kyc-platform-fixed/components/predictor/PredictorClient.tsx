'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import PriceChart from './PriceChart';

interface MandiOptions { commodities: string[]; states: string[]; markets: string[]; }

interface Summary {
  latestSnapshotDate: string | null;
  latestArrivalDate: string | null;
  recordsCount: number;
  marketsCount: number;
  avgModalPrice: number | null;
  avgMinPrice: number | null;
  avgMaxPrice: number | null;
  topMarkets: { market: string; district: string; state: string; modal_price: number | null; min_price: number | null; max_price: number | null; arrival_date: string; }[];
}

interface HistoryPoint {
  arrival_date: string;
  avg_modal_price: number | null;
  avg_min_price: number | null;
  avg_max_price: number | null;
}

interface ForecastResult {
  commodity: string; market: string; state: string;
  latestPrice: number | null;
  forecast: { date: string; price: number; lower: number; upper: number }[];
  mape: number | null; direction: 'up' | 'down' | 'flat'; trend_pct: number;
  dataPoints: number; insufficient: boolean; message?: string;
  insights?: string | null;
  alpha?: number; beta?: number;
}

function fmt(n: number | null) {
  if (n == null) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/** yyyy-mm-dd → dd/mm/yyyy for display */
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  return iso;
}

/** Render markdown-ish bold from OpenAI response */
function InsightsBody({ text }: { text: string }) {
  const lines = text.split('\n').filter(Boolean);
  return (
    <div style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--muted)' }}>
      {lines.map((line, i) => {
        // Bold headers like **Price Outlook**
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i} style={{ margin: '0 0 8px' }}>
            {parts.map((part, j) =>
              part.startsWith('**') && part.endsWith('**')
                ? <strong key={j} style={{ color: 'var(--text)', fontWeight: 600 }}>{part.slice(2, -2)}</strong>
                : part
            )}
          </p>
        );
      })}
    </div>
  );
}

function ServiceDown() {
  return (
    <div className="notice notice-gold" style={{ marginBottom: 24 }}>
      <strong>Mandi service not running.</strong>{' '}
      Start it with: <code style={{ background: 'rgba(0,0,0,.3)', padding: '2px 6px', borderRadius: 4 }}>cd mandi-service && npm run dev</code>
      {' '}— then refresh this page.
    </div>
  );
}

export default function PredictorClient() {
  const [serviceUp, setServiceUp]   = useState<boolean | null>(null);
  const [options, setOptions]       = useState<MandiOptions | null>(null);
  const [commodity, setCommodity]   = useState('Wheat');
  const [state, setState]           = useState('');
  const [market, setMarket]         = useState('');
  const [summary, setSummary]       = useState<Summary | null>(null);
  const [history, setHistory]       = useState<HistoryPoint[]>([]);
  const [forecast, setForecast]     = useState<ForecastResult | null>(null);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState<'chart' | 'markets' | 'forecast'>('chart');

  useEffect(() => {
    fetch('/api/predictor/status')
      .then((r) => { setServiceUp(r.ok); })
      .catch(() => setServiceUp(false));
  }, []);

  useEffect(() => {
    if (!serviceUp) return;
    fetch('/api/predictor/options')
      .then((r) => r.json()).then(setOptions).catch(() => {});
  }, [serviceUp]);

  const load = useCallback(async () => {
    if (!serviceUp) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (commodity) params.set('commodity', commodity);
    if (state)     params.set('state', state);
    if (market)    params.set('market', market);
    try {
      const [sumRes, histRes, foreRes] = await Promise.all([
        fetch(`/api/predictor/summary?${params}`),
        fetch(`/api/predictor/history?${params}`),
        fetch(`/api/predictor/forecast?${params}`),
      ]);
      if (sumRes.ok)  setSummary(await sumRes.json());
      if (histRes.ok) setHistory(await histRes.json());
      if (foreRes.ok) setForecast(await foreRes.json()); else setForecast(null);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [serviceUp, commodity, state, market]);

  useEffect(() => { load(); }, [load]);

  const tabBtn = (id: typeof tab, icon: string, label: string) => (
    <button onClick={() => setTab(id)} className="btn btn-sm"
      style={{ background: tab === id ? 'var(--bg4)' : 'transparent', border: tab === id ? '1px solid var(--border2)' : '1px solid transparent', fontSize: 13 }}>
      {icon} {label}
    </button>
  );

  const dirColor = forecast?.direction === 'up' ? 'var(--green)' : forecast?.direction === 'down' ? 'var(--red)' : 'var(--muted)';
  const dirArrow = forecast?.direction === 'up' ? '↑' : forecast?.direction === 'down' ? '↓' : '→';

  return (
    <main className="predictor-shell">
      {/* Header */}
      <div style={{ paddingBottom: 24, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 26 }}>⚡</span>
          <h1 className="serif" style={{ fontSize: 30, margin: 0 }}>Commodity Price Predictor</h1>
          <span className="badge badge-gold" style={{ fontSize: 10 }}>★ Pro</span>
        </div>
        <p style={{ color: 'var(--muted)', margin: 0, fontSize: 14 }}>
          Real-time Agmarknet data · Adaptive Holt-Winters forecast · AI-powered insights · Updated daily
        </p>
      </div>

      {serviceUp === false && <ServiceDown />}

      <div className="predictor-grid">
        {/* Sidebar */}
        <aside style={{ display: 'grid', gap: 14 }}>
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontFamily: 'Lora,serif', fontSize: 16, margin: '0 0 16px' }}>Filter</h3>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Commodity</label>
              <select className="select" value={commodity} onChange={(e) => { setCommodity(e.target.value); setMarket(''); }}>
                {(options?.commodities || ['Wheat', 'Onion', 'Tomato', 'Soybean', 'Cotton', 'Rice', 'Maize']).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">State</label>
              <select className="select" value={state} onChange={(e) => { setState(e.target.value); setMarket(''); }}>
                <option value="">All States</option>
                {(options?.states || []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Market</label>
              <select className="select" value={market} onChange={(e) => setMarket(e.target.value)}>
                <option value="">All Markets</option>
                {(options?.markets || []).map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <button onClick={load} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh data'}
            </button>
          </div>

          {summary && (
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>Data Status</div>
              {[
                ['Records', summary.recordsCount.toLocaleString()],
                ['Markets', summary.marketsCount.toLocaleString()],
                ['Latest data', fmtDate(summary.latestArrivalDate)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>{k}</span>
                  <span style={{ fontWeight: 500 }}>{v}</span>
                </div>
              ))}
              {forecast && !forecast.insufficient && (
                <div style={{ marginTop: 12, padding: '8px 0', fontSize: 12, color: 'var(--dim)' }}>
                  Model: α={forecast.alpha?.toFixed(2)} β={forecast.beta?.toFixed(2)} · MAPE {forecast.mape?.toFixed(1)}%
                </div>
              )}
            </div>
          )}

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>Related Analysis</div>
            <Link href={`/search?q=${encodeURIComponent(commodity)}`} className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}>
              Search "{commodity}" articles →
            </Link>
          </div>
        </aside>

        {/* Main panel */}
        <div style={{ display: 'grid', gap: 18 }}>
          {/* Metric cards */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
              {[
                { label: 'Avg Modal Price', val: fmt(summary.avgModalPrice), color: 'var(--text)' },
                { label: 'Price Range', val: `${fmt(summary.avgMinPrice)} – ${fmt(summary.avgMaxPrice)}`, color: 'var(--muted)' },
                { label: 'Markets Tracked', val: summary.marketsCount.toLocaleString(), color: 'var(--green)' },
              ].map((m) => (
                <div key={m.label} className="card metric-card">
                  <div className="metric-label">{m.label}</div>
                  <div className="metric-val" style={{ color: m.color, fontSize: 22 }}>{m.val}</div>
                </div>
              ))}
            </div>
          )}

          {/* 14-day forecast summary strip */}
          {forecast && !forecast.insufficient && (
            <div className="card-elevated" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontFamily: 'Lora,serif', fontSize: 17, fontWeight: 600 }}>14-Day Forecast</span>
                <span className={`badge ${forecast.direction === 'up' ? 'badge-green' : forecast.direction === 'down' ? 'badge-red' : ''}`} style={{ fontSize: 12 }}>
                  {dirArrow} {Math.abs(forecast.trend_pct).toFixed(1)}%
                </span>
                <span style={{ fontSize: 12, color: 'var(--dim)', marginLeft: 'auto' }}>
                  {forecast.dataPoints} data points · MAPE {forecast.mape?.toFixed(1)}%
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 }}>
                {forecast.forecast.slice(0, 7).map((f) => (
                  <div key={f.date} style={{ padding: '10px 8px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 4 }}>
                      {new Date(f.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: dirColor }}>{fmt(f.price)}</div>
                    <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>±{fmt(f.upper - f.price)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Insights */}
          {forecast?.insights && (
            <div className="card-elevated" style={{ padding: '20px 24px', borderLeft: '3px solid var(--gold)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 16 }}>✦</span>
                <span style={{ fontFamily: 'Lora,serif', fontSize: 16, fontWeight: 600 }}>AI Market Analysis</span>
                <span className="badge badge-gold" style={{ fontSize: 10, marginLeft: 4 }}>GPT-4o mini</span>
              </div>
              <InsightsBody text={forecast.insights} />
              <p style={{ fontSize: 11, color: 'var(--dim)', marginTop: 14, marginBottom: 0, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                Analysis generated by AI based on {forecast.dataPoints} days of Agmarknet data. Not financial advice.
              </p>
            </div>
          )}

          {/* Tabs */}
          <div className="card-elevated" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              {tabBtn('chart', '📈', 'Price History')}
              {tabBtn('markets', '🏪', 'Top Markets')}
              {tabBtn('forecast', '🔮', 'Full Forecast')}
            </div>

            <div style={{ padding: 20, minHeight: 300 }}>
              {tab === 'chart' && (
                history.length > 0
                  ? <PriceChart data={history} commodity={commodity} />
                  : <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
                      {serviceUp === false ? 'Start the mandi service to load live data.' : loading ? 'Loading…' : 'No price history for this selection.'}
                    </div>
              )}

              {tab === 'markets' && (
                summary?.topMarkets?.length
                  ? <table className="table">
                      <thead><tr><th>Market</th><th>District</th><th>State</th><th>Modal</th><th>Range</th><th>Date</th></tr></thead>
                      <tbody>
                        {summary.topMarkets.map((m, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 500 }}>{m.market}</td>
                            <td style={{ color: 'var(--muted)' }}>{m.district}</td>
                            <td style={{ color: 'var(--muted)' }}>{m.state}</td>
                            <td style={{ color: 'var(--green)', fontWeight: 600 }}>{fmt(m.modal_price)}</td>
                            <td style={{ color: 'var(--dim)', fontSize: 12 }}>{fmt(m.min_price)}–{fmt(m.max_price)}</td>
                            <td style={{ color: 'var(--dim)', fontSize: 12 }}>{fmtDate(m.arrival_date)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  : <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>No market data available.</div>
              )}

              {tab === 'forecast' && (
                forecast
                  ? forecast.insufficient
                    ? <div className="notice notice-gold">{forecast.message}</div>
                    : <>
                        <div style={{ display: 'flex', gap: 28, marginBottom: 20, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ color: 'var(--dim)', fontSize: 12 }}>Current price</div>
                            <div style={{ fontWeight: 700, fontSize: 24, fontFamily: 'Lora,serif' }}>{fmt(forecast.latestPrice)}</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--dim)', fontSize: 12 }}>14-day trend</div>
                            <div style={{ fontWeight: 700, fontSize: 24, fontFamily: 'Lora,serif', color: dirColor }}>
                              {dirArrow} {Math.abs(forecast.trend_pct).toFixed(1)}%
                            </div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--dim)', fontSize: 12 }}>Model accuracy (MAPE)</div>
                            <div style={{ fontWeight: 700, fontSize: 24, fontFamily: 'Lora,serif' }}>{forecast.mape?.toFixed(1)}%</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--dim)', fontSize: 12 }}>Optimised params</div>
                            <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4, fontFamily: 'monospace' }}>α={forecast.alpha?.toFixed(2)} β={forecast.beta?.toFixed(2)}</div>
                          </div>
                        </div>
                        <table className="table">
                          <thead><tr><th>Date</th><th>Forecast Price</th><th>Lower</th><th>Upper</th></tr></thead>
                          <tbody>
                            {forecast.forecast.map((f) => (
                              <tr key={f.date}>
                                <td>{new Date(f.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                                <td style={{ fontWeight: 600, color: dirColor }}>{fmt(f.price)}</td>
                                <td style={{ color: 'var(--dim)' }}>{fmt(f.lower)}</td>
                                <td style={{ color: 'var(--dim)' }}>{fmt(f.upper)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p style={{ fontSize: 12, color: 'var(--dim)', marginTop: 14, lineHeight: 1.65 }}>
                          Adaptive Holt's Double Exponential Smoothing — parameters α and β are grid-searched to
                          minimise MAPE over {forecast.dataPoints} historical data points. Confidence bands ±{forecast.mape !== null ? (forecast.mape * 1.5).toFixed(1) : '—'}%.
                          Not a guarantee — use alongside fundamental market analysis.
                        </p>
                      </>
                  : <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
                      {serviceUp === false ? 'Start the mandi service.' : 'No forecast available for this selection.'}
                    </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
