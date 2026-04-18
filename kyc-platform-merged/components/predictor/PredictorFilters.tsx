'use client';

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

  const availableMarkets = state ? (options.marketsByState[state] ?? []) : options.markets;

  const handleStateChange = useCallback((newState: string) => {
    setState(newState);
    const validMarkets = newState ? (options.marketsByState[newState] ?? []) : options.markets;
    if (market && !validMarkets.includes(market)) setMarket('');
  }, [market, options.marketsByState, options.markets]);

  const summaryText = `${current.commodity} · ${current.state}${current.market ? ` · ${current.market}` : ''} · ${current.horizon}d`;

  return (
    <div className="pr-filters">
      {/* ── Desktop: horizontal bar ─────────────────────────────── */}
      <form method="get" className="pr-filter-bar">
        <div className="pr-filter-group">
          <label className="pr-filter-label">Commodity</label>
          <select
            name="commodity"
            className="pr-filter-select"
            value={commodity}
            onChange={(e) => setCommodity(e.target.value)}
          >
            {options.commodities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="pr-filter-group">
          <label className="pr-filter-label">State</label>
          <select
            name="state"
            className="pr-filter-select"
            value={state}
            onChange={(e) => handleStateChange(e.target.value)}
          >
            <option value="">All states</option>
            {options.states.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="pr-filter-group">
          <label className="pr-filter-label">
            Market{state ? ` (${availableMarkets.length})` : ''}
          </label>
          <select
            name="market"
            className="pr-filter-select"
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            disabled={state !== '' && availableMarkets.length === 0}
          >
            <option value="">
              {state && availableMarkets.length === 0 ? 'None' : 'All markets'}
            </option>
            {availableMarkets.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="pr-filter-group">
          <label className="pr-filter-label">Horizon</label>
          <select
            name="horizon"
            className="pr-filter-select"
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
          >
            {HORIZONS.map((d) => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
        </div>

        <button type="submit" className="pr-filter-apply">
          Apply
        </button>
      </form>

      {/* ── Mobile: pill row + drawer ────────────────────────────── */}
      <div className="pr-filter-mobile">
        <button
          type="button"
          className="pr-filter-pill"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
            <path d="M1 2.5h11M3 6.5h7M5 10.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span>{summaryText}</span>
          <span className="pr-filter-chevron">{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <form method="get" className="pr-filter-drawer">
            <div className="pr-drawer-grid">
              <div className="pr-filter-group">
                <label className="pr-filter-label">Commodity</label>
                <select
                  name="commodity"
                  className="pr-filter-select"
                  value={commodity}
                  onChange={(e) => setCommodity(e.target.value)}
                >
                  {options.commodities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="pr-filter-group">
                <label className="pr-filter-label">State</label>
                <select
                  name="state"
                  className="pr-filter-select"
                  value={state}
                  onChange={(e) => handleStateChange(e.target.value)}
                >
                  <option value="">All states</option>
                  {options.states.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="pr-filter-group">
                <label className="pr-filter-label">
                  Market{state ? ` (${availableMarkets.length})` : ''}
                </label>
                <select
                  name="market"
                  className="pr-filter-select"
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                  disabled={state !== '' && availableMarkets.length === 0}
                >
                  <option value="">
                    {state && availableMarkets.length === 0 ? 'None' : 'All markets'}
                  </option>
                  {availableMarkets.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="pr-filter-group">
                <label className="pr-filter-label">Horizon</label>
                <select
                  name="horizon"
                  className="pr-filter-select"
                  value={horizon}
                  onChange={(e) => setHorizon(Number(e.target.value))}
                >
                  {HORIZONS.map((d) => (
                    <option key={d} value={d}>{d} days</option>
                  ))}
                </select>
              </div>
            </div>

            <button type="submit" className="pr-filter-apply pr-filter-apply-full">
              Apply Filters
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
