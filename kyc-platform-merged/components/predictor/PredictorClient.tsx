'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import PriceChart from './PriceChart';

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

interface HistoryPoint {
  arrival_date:    string;
  avg_modal_price: number | null;
  avg_min_price:   number | null;
  avg_max_price:   number | null;
}

interface ForecastMeta {
  mape: number | null; mae: number | null; rmse: number | null; smape: number | null;
  model_type: string; alpha: number; beta: number;
  data_points: number; real_data_points: number;
  synthetic_ratio: number; has_synthetic_data: boolean; disclaimer: string;
}

interface ForecastResult {
  commodity: string; market: string; state: string;
  latestPrice: number | null;
  forecast: { date: string; price: number; lower: number; upper: number }[];
  direction: 'up' | 'down' | 'flat'; trend_pct: number;
  dataPoints: number; insufficient: boolean; message?: string; meta?: ForecastMeta;
}

function fmt(n: number | null) {
  if (n === null) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export default function PredictorClient() {
  const [serviceUp,  setServiceUp]  = useState<boolean | null>(null);
  const [options,    setOptions]    = useState<MandiOptions | null>(null);
  const [commodity,  setCommodity]  = useState('Wheat');
  const [state,      setState]      = useState('');
  const [market,     setMarket]     = useState('');
  const [summary,    setSummary]    = useState<Summary | null>(null);
  const [history,    setHistory]    = useState<HistoryPoint[]>([]);
  const [forecast,   setForecast]   = useState<ForecastResult | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [optLoading, setOptLoading] = useState(false);
  const [tab,        setTab]        = useState<'chart' | 'markets' | 'forecast'>('chart');
  const [error,      setError]      = useState('');

  // Derived: markets/districts filtered to the selected state
  const availableMarkets = state && options?.marketsByState?.[state]
    ? options.marketsByState[state]
    : (options?.markets ?? []);

  // Reset market when state changes
  useEffect(() => { setMarket(''); }, [state]);

  // Check auth / service availability (fast — no data fetch)
  useEffect(() => {
    fetch('/api/predictor/status')
      .then((r) => {
        if (r.status === 403) { setServiceUp(false); setError('Premium access required.'); return; }
        setServiceUp(r.ok);
      })
      .catch(() => { setServiceUp(false); setError('Could not reach server.'); });
  }, []);

  // Load filter options (triggers first data fetch from data.gov.in)
  useEffect(() => {
    if (!serviceUp) return;
    setOptLoading(true);
    fetch('/api/predictor/options')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setOptions(d); })
      .catch(() => {})
      .finally(() => setOptLoading(false));
  }, [serviceUp]);

  const load = useCallback(async () => {
    if (!serviceUp) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (commodity) params.set('commodity', commodity);
    if (state)     params.set('state',     state);
    if (market)    params.set('market',    market);

    try {
      const [sumRes, histRes, foreRes] = await Promise.all([
        fetch(`/api/predictor/summary?${params}`),
        fetch(`/api/predictor/history?${params}`),
        fetch(`/api/predictor/forecast?${params}`),
      ]);
      if (sumRes.ok)  setSummary(await sumRes.json());
      if (histRes.ok) setHistory(await histRes.json());
      if (foreRes.ok) setForecast(await foreRes.json()); else setForecast(null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [serviceUp, commodity, state, market]);

  useEffect(() => { load(); }, [load]);

  const tabBtn = (id: 'chart' | 'markets' | 'forecast', label: string) => (
    <button
      onClick={() => setTab(id)}
      className="btn btn-sm"
      style={{
        background:  tab === id ? 'var(--bg4)' : 'transparent',
        border:      tab === id ? '1px solid var(--border2)' : '1px solid transparent',
        fontSize: 13,
      }}
    >
      {label}
    </button>
  );

  // ── Loading / error states ─────────────────────────────────────────────────
  if (serviceUp === null) {
    return (
      <main className="predictor-shell">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '60px 20px', justifyContent: 'center', color: 'var(--muted)' }}>
          <span style={{ fontSize: 18 }}>⏳</span> Checking access…
        </div>
      </main>
    );
  }

  if (serviceUp === false) {
    return (
      <main className="predictor-shell">
        <div className="notice notice-red" style={{ marginBottom: 24 }}>
          <strong>{error || 'Predictor unavailable.'}</strong>{' '}
          {error === 'Premium access required.' ? (
            <Link href="/subscribe" style={{ color: 'var(--gold)' }}>Upgrade to Pro →</Link>
          ) : (
            'Please try again in a moment.'
          )}
        </div>
      </main>
    );
  }

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
          Real-time Agmarknet data · 14-day trend forecast · Updated daily
        </p>
      </div>

      <div className="predictor-grid">
        {/* Sidebar controls */}
        <aside style={{ display: 'grid', gap: 14 }}>
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontFamily: 'Lora,serif', fontSize: 16, margin: '0 0 16px' }}>Filter</h3>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Commodity</label>
              <select
                className="select"
                value={commodity}
                onChange={(e) => setCommodity(e.target.value)}
                disabled={optLoading}
              >
                {(options?.commodities.length
                  ? options.commodities
                  : ['Wheat', 'Onion', 'Tomato', 'Soybean', 'Cotton', 'Rice', 'Maize']
                ).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">State</label>
              <select
                className="select"
                value={state}
                onChange={(e) => setState(e.target.value)}
                disabled={optLoading}
              >
                <option value="">All States</option>
                {(options?.states ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">
                Market
                {state && <span style={{ color: 'var(--dim)', fontWeight: 400, marginLeft: 6, fontSize: 11 }}>({state})</span>}
              </label>
              <select
                className="select"
                value={market}
                onChange={(e) => setMarket(e.target.value)}
                disabled={optLoading}
              >
                <option value="">All Markets</option>
                {availableMarkets.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <button
              onClick={load}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={loading || optLoading}
            >
              {loading ? 'Loading…' : optLoading ? 'Fetching data…' : 'Refresh'}
            </button>

            {optLoading && (
              <p style={{ fontSize: 11, color: 'var(--dim)', textAlign: 'center', margin: '10px 0 0' }}>
                Fetching live market data…
              </p>
            )}
          </div>

          {/* Status card */}
          {summary && (
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>Data Status</div>
              {[
                ['Records',     summary.recordsCount.toLocaleString()],
                ['Markets',     summary.marketsCount.toLocaleString()],
                ['Latest data', summary.latestArrivalDate || '—'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>{k}</span>
                  <span style={{ fontWeight: 500 }}>{v}</span>
                </div>
              ))}
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

          {/* Loading overlay */}
          {loading && !summary && (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
              <div style={{ fontWeight: 500, marginBottom: 6 }}>Loading market data…</div>
              <div style={{ fontSize: 13, color: 'var(--dim)' }}>First load fetches live data from Agmarknet — may take a few seconds.</div>
            </div>
          )}

          {/* Metric cards */}
          {summary && (
            <div className="grid-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {[
                { label: 'Avg Modal Price',  val: fmt(summary.avgModalPrice),  color: 'var(--text)' },
                { label: 'Price Range',      val: `${fmt(summary.avgMinPrice)} – ${fmt(summary.avgMaxPrice)}`, color: 'var(--muted)' },
                { label: 'Markets Tracked',  val: summary.marketsCount.toLocaleString(), color: 'var(--green)' },
              ].map((m) => (
                <div key={m.label} className="card metric-card">
                  <div className="metric-label">{m.label}</div>
                  <div className="metric-val" style={{ color: m.color, fontSize: 22 }}>{m.val}</div>
                </div>
              ))}
            </div>
          )}

          {/* Forecast summary card */}
          {forecast && !forecast.insufficient && (
            <div className="card-elevated" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontFamily: 'Lora,serif', fontSize: 17, fontWeight: 600 }}>14-Day Forecast</span>
                <span className={`badge ${forecast.direction === 'up' ? 'badge-green' : forecast.direction === 'down' ? 'badge-red' : ''}`}>
                  {forecast.direction === 'up' ? '↑' : forecast.direction === 'down' ? '↓' : '→'}{' '}
                  {Math.abs(forecast.trend_pct).toFixed(1)}%
                </span>
                {forecast.meta?.mape != null && (
                  <span style={{ fontSize: 12, color: 'var(--dim)', marginLeft: 'auto' }}>MAPE: {forecast.meta.mape.toFixed(1)}%</span>
                )}
              </div>
              <div className="grid-3" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {forecast.forecast.slice(0, 6).map((f) => (
                  <div key={f.date} style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 4 }}>
                      {new Date(f.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{fmt(f.price)}</div>
                    <div style={{ fontSize: 11, color: 'var(--dim)' }}>{fmt(f.lower)}–{fmt(f.upper)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="card-elevated" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              {tabBtn('chart',    '📈 Price History')}
              {tabBtn('markets',  '🏪 Top Markets')}
              {tabBtn('forecast', '🔮 Forecast Detail')}
            </div>

            <div style={{ padding: 20, minHeight: 300 }}>
              {tab === 'chart' && (
                history.length > 0 ? (
                  <PriceChart data={history} commodity={commodity} />
                ) : (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
                    {loading ? 'Loading chart data…' : 'No price history for this selection. Try a broader filter.'}
                  </div>
                )
              )}

              {tab === 'markets' && (
                summary?.topMarkets?.length ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Market</th><th>District</th><th>State</th>
                        <th>Modal Price</th><th>Range</th><th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.topMarkets.map((m, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 500 }}>{m.market}</td>
                          <td>{m.district}</td>
                          <td>{m.state}</td>
                          <td style={{ color: 'var(--green)', fontWeight: 600 }}>{fmt(m.modal_price)}</td>
                          <td style={{ color: 'var(--dim)', fontSize: 12 }}>{fmt(m.min_price)}–{fmt(m.max_price)}</td>
                          <td style={{ color: 'var(--dim)', fontSize: 12 }}>{m.arrival_date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
                    {loading ? 'Loading…' : 'No market data available.'}
                  </div>
                )
              )}

              {tab === 'forecast' && (
                forecast ? (
                  forecast.insufficient ? (
                    <div className="notice notice-gold">{forecast.message || 'Insufficient data for a reliable forecast. Need at least 7 days of price history.'}</div>
                  ) : (
                    <div>
                      <div style={{ marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <div>
                          <span style={{ color: 'var(--dim)', fontSize: 12 }}>Current price</span>
                          <div style={{ fontWeight: 700, fontSize: 22, fontFamily: 'Lora,serif' }}>{fmt(forecast.latestPrice)}</div>
                        </div>
                        <div>
                          <span style={{ color: 'var(--dim)', fontSize: 12 }}>14-day trend</span>
                          <div style={{ fontWeight: 700, fontSize: 22, fontFamily: 'Lora,serif', color: forecast.direction === 'up' ? 'var(--green)' : 'var(--red)' }}>
                            {forecast.direction === 'up' ? '+' : ''}{forecast.trend_pct.toFixed(1)}%
                          </div>
                        </div>
                        {forecast.meta?.mape != null && (
                          <div>
                            <span style={{ color: 'var(--dim)', fontSize: 12 }}>Forecast error (MAPE)</span>
                            <div style={{ fontWeight: 700, fontSize: 22, fontFamily: 'Lora,serif' }}>{forecast.meta.mape.toFixed(1)}%</div>
                          </div>
                        )}
                      </div>
                      <table className="table">
                        <thead><tr><th>Date</th><th>Forecast</th><th>Lower</th><th>Upper</th></tr></thead>
                        <tbody>
                          {forecast.forecast.map((f) => (
                            <tr key={f.date}>
                              <td>{new Date(f.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                              <td style={{ fontWeight: 600 }}>{fmt(f.price)}</td>
                              <td style={{ color: 'var(--dim)' }}>{fmt(f.lower)}</td>
                              <td style={{ color: 'var(--dim)' }}>{fmt(f.upper)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p style={{ fontSize: 12, color: 'var(--dim)', marginTop: 14, lineHeight: 1.6 }}>
                        Holt&apos;s exponential smoothing on {forecast.dataPoints} data points.
                        Confidence bands ±{forecast.meta?.mape != null ? (forecast.meta.mape * 1.5).toFixed(1) : '10'}%.
                        Not a guarantee — use alongside fundamental market knowledge.
                      </p>
                    </div>
                  )
                ) : (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
                    {loading ? 'Loading…' : 'No forecast data for this selection.'}
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
