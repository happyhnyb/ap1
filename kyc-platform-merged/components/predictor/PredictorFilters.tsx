'use client';

import { useState, useCallback } from 'react';

type FilterOptions = {
  commodities: string[];
  states: string[];
  markets: string[];
  districts: string[];
  marketsByState: Record<string, string[]>;
  districtsByState: Record<string, string[]>;
  marketsByDistrict: Record<string, string[]>;
};

type Props = {
  options: FilterOptions;
  current: {
    commodity: string;
    state: string;
    district: string;
    market: string;
    horizon: number;
  };
  isSidebar?: boolean;
};

const HORIZONS = [3, 5, 7, 10, 14] as const;

export default function PredictorFilters({ options, current, isSidebar }: Props) {
  const [commodity, setCommodity] = useState(current.commodity);
  const [state,     setState]     = useState(current.state);
  const [district,  setDistrict]  = useState(current.district);
  const [market,    setMarket]    = useState(current.market);
  const [horizon,   setHorizon]   = useState(current.horizon);

  const availableDistricts = state ? (options.districtsByState[state] ?? []) : options.districts;
  const districtKey = `${state}::${district}`;
  const availableMarkets = district
    ? (options.marketsByDistrict[districtKey] ?? [])
    : state
      ? (options.marketsByState[state] ?? [])
      : options.markets;

  const handleStateChange = useCallback((newState: string) => {
    setState(newState);
    setDistrict('');
    const validMarkets = newState ? (options.marketsByState[newState] ?? []) : options.markets;
    if (market && !validMarkets.includes(market)) setMarket('');
  }, [market, options.marketsByState, options.markets]);

  const handleDistrictChange = useCallback((newDistrict: string) => {
    setDistrict(newDistrict);
    const key = `${state}::${newDistrict}`;
    const validMarkets = newDistrict
      ? (options.marketsByDistrict[key] ?? [])
      : state
        ? (options.marketsByState[state] ?? [])
        : options.markets;
    if (market && !validMarkets.includes(market)) setMarket('');
  }, [market, options.markets, options.marketsByDistrict, options.marketsByState, state]);

  const summaryText = `${commodity} · ${state || 'All states'}${district ? ` · ${district}` : ''}${market ? ` · ${market}` : ''} · ${horizon}d`;

  const fields = (
    <>
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
          City{state ? ` (${availableDistricts.length})` : ''}
        </label>
        <select
          name="district"
          className="pr-filter-select"
          value={district}
          onChange={(e) => handleDistrictChange(e.target.value)}
          disabled={state !== '' && availableDistricts.length === 0}
        >
          <option value="">
            {state && availableDistricts.length === 0 ? 'None' : 'All cities'}
          </option>
          {availableDistricts.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <div className="pr-filter-group">
        <label className="pr-filter-label">
          Market{district || state ? ` (${availableMarkets.length})` : ''}
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
    </>
  );

  // ── Sidebar variant: vertical stacked form, always open ──────────────────
  if (isSidebar) {
    return (
      <form method="get" className="pr-sidebar-form">
        {fields}
        <button type="submit" className="pr-sidebar-apply">Apply Filters</button>
      </form>
    );
  }

  // ── Mobile variant: always-visible compact card ──────────────────────────
  return (
    <form method="get" className="pr-mf-form">
      <div className="pr-mf-header">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M1 2.5h10M3 6h6M5 9.5h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <span className="pr-mf-title">Filters</span>
        <span className="pr-mf-current">{summaryText}</span>
      </div>
      <div className="pr-mf-grid">
        {fields}
      </div>
      <button type="submit" className="pr-mf-apply">Apply</button>
    </form>
  );
}
