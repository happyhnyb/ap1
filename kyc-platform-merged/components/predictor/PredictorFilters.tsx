'use client';

/**
 * PredictorFilters — client component
 *
 * Provides a dependent filter form:
 *   Commodity → State → Market → Horizon
 *
 * When state changes, market options update instantly (client-side)
 * without a server round-trip, using the pre-loaded marketsByState map.
 *
 * Submits as a GET form so the URL reflects the current selection and
 * the server-rendered predictor page reruns with the new filters.
 */

import { useState, useCallback } from 'react';

type FilterOptions = {
  commodities: string[];
  states: string[];
  markets: string[];
  marketsByState: Record<string, string[]>;
};

type Props = {
  options: FilterOptions;
  current: {
    commodity: string;
    state: string;
    market: string;
    horizon: number;
  };
};

const HORIZONS = [3, 5, 7, 10, 14] as const;

export default function PredictorFilters({ options, current }: Props) {
  const [commodity, setCommodity] = useState(current.commodity);
  const [state,     setState]     = useState(current.state);
  const [market,    setMarket]    = useState(current.market);
  const [horizon,   setHorizon]   = useState(current.horizon);
  const [open,      setOpen]      = useState(false);

  // Markets available for the currently selected state
  const availableMarkets = state
    ? (options.marketsByState[state] ?? [])
    : options.markets;

  // When state changes, clear market if it's no longer valid
  const handleStateChange = useCallback((newState: string) => {
    setState(newState);
    const validMarkets = newState ? (options.marketsByState[newState] ?? []) : options.markets;
    if (market && !validMarkets.includes(market)) setMarket('');
  }, [market, options.marketsByState, options.markets]);

  const selectClass = 'select';

  return (
    <div className="card pred-filter-card">
      {/* Header / toggle (toggle only active on mobile) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: open ? 14 : 0, gap: 8 }}>
        <div style={{ fontFamily: 'Lora,serif', fontSize: 15, fontWeight: 600, minWidth: 0 }}>
          Filters
          {!open && state && (
            <span style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'inherit', fontWeight: 400 }}>
              {' '}— {commodity}, {state.length > 14 ? state.split(' ')[0] : state}
            </span>
          )}
        </div>
        {/* Mobile-only toggle button */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="pred-filter-toggle"
          style={{
            width: 'auto', padding: '5px 10px', fontSize: 11, fontWeight: 600,
            color: 'var(--green)', borderRadius: 6,
            border: '1px solid rgba(76,175,80,.25)', background: 'rgba(76,175,80,.06)',
          }}
          aria-expanded={open}
        >
          <span className="pred-filter-chevron">{open ? '▲ Close' : '▼ Change'}</span>
        </button>
      </div>

      {/* Filter body — hidden on mobile unless open, always visible on desktop */}
      <div className="pred-filter-body-wrap" data-open={open ? 'true' : 'false'}>
        <form method="get" style={{ display: 'grid', gap: 12, paddingTop: 4 }}>

          <div className="form-group">
            <label className="form-label">Commodity</label>
            <select
              name="commodity"
              className={selectClass}
              value={commodity}
              onChange={(e) => setCommodity(e.target.value)}
            >
              {options.commodities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">State</label>
            <select
              name="state"
              className={selectClass}
              value={state}
              onChange={(e) => handleStateChange(e.target.value)}
            >
              <option value="">All states</option>
              {options.states.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">
              Market
              {state && (
                <span style={{ color: 'var(--dim)', fontWeight: 400, marginLeft: 4 }}>
                  ({availableMarkets.length})
                </span>
              )}
            </label>
            <select
              name="market"
              className={selectClass}
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              disabled={state !== '' && availableMarkets.length === 0}
            >
              <option value="">
                {state && availableMarkets.length === 0 ? 'No markets for this state' : 'All markets'}
              </option>
              {availableMarkets.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Forecast horizon</label>
            <select
              name="horizon"
              className={selectClass}
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
            >
              {HORIZONS.map((d) => (
                <option key={d} value={d}>{d} days</option>
              ))}
            </select>
          </div>

          <button type="submit" className="btn btn-primary btn-full" style={{ marginTop: 4 }}>
            Apply Filters
          </button>

        </form>
      </div>

      {/* Desktop/mobile show/hide handled by globals.css .pred-filter-body-wrap rules */}
    </div>
  );
}
