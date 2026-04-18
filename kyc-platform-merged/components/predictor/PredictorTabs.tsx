'use client';

import { useState } from 'react';

type MarketRow = {
  market: string;
  state: string;
  district: string;
  modal_price: number | null;
  min_price: number | null;
  max_price: number | null;
};

type QualityData = {
  missing_ratio: number;
  real_days: number;
  stale_days: number;
  missing_days: number;
  outlier_days: number;
  date_range?: [string, string] | null;
};

type DriverFeature = {
  feature_name: string;
  importance: number;
  direction: string;
};

type Props = {
  commodity: string;
  marketRows: MarketRow[];
  maxMarketPrice: number;
  quality: QualityData;
  drivers: DriverFeature[];
  maxDriverImp: number;
  recentErrorBand: number | null;
};

type Tab = 'Markets' | 'Quality' | 'Drivers';

function fmt(v: number | null) {
  if (v == null || Number.isNaN(v)) return '—';
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: v >= 100 ? 0 : 2 })}`;
}

export default function PredictorTabs({
  commodity,
  marketRows,
  maxMarketPrice,
  quality,
  drivers,
  maxDriverImp,
  recentErrorBand,
}: Props) {
  const [active, setActive] = useState<Tab>('Markets');

  const dq = quality;
  const missingPct = Math.round(dq.missing_ratio * 100);
  const realPct = 100 - missingPct;
  const rating =
    dq.missing_ratio > 0.4 || dq.real_days < 14
      ? { label: 'Low',    color: 'var(--red)'   }
      : dq.missing_ratio > 0.2 || dq.stale_days > 5
        ? { label: 'Medium', color: 'var(--gold)'  }
        : { label: 'High',   color: 'var(--green)' };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'Markets',  label: `Markets` },
    { key: 'Quality',  label: 'Data Quality' },
    { key: 'Drivers',  label: 'Drivers' },
  ];

  return (
    <div className="card pr-tabs-card">
      {/* Tab header */}
      <div className="pr-tabs" role="tablist">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={active === key}
            className={`pr-tab-btn${active === key ? ' active' : ''}`}
            onClick={() => setActive(key)}
          >
            {label}
          </button>
        ))}
        {/* Commodity context shown next to Markets tab */}
        {active === 'Markets' && (
          <span className="pr-tab-context">{commodity}</span>
        )}
      </div>

      <div className="pr-tab-panel">

        {/* ── Markets ── */}
        {active === 'Markets' && (
          marketRows.length ? (
            <div className="pr-markets">
              {marketRows.slice(0, 10).map((row) => {
                const barPct = Math.round(((row.modal_price ?? 0) / maxMarketPrice) * 100);
                return (
                  <div key={row.market} className="pr-market-row">
                    <div className="pr-market-info">
                      <span className="pr-market-name">{row.market}</span>
                      <span className="pr-market-dist">{row.district}</span>
                      <span className="pr-market-price">{fmt(row.modal_price)}</span>
                    </div>
                    <div className="pr-bar-track">
                      <div className="pr-bar-fill" style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="pr-empty">No markets for this selection.</p>
          )
        )}

        {/* ── Quality ── */}
        {active === 'Quality' && (
          <div className="pr-quality">
            <div className="pr-qual-header">
              <span className="pr-qual-dot" style={{ background: rating.color }} />
              <span className="pr-qual-rating" style={{ color: rating.color }}>{rating.label} quality</span>
              {dq.date_range && (
                <span className="pr-qual-range">{dq.date_range[0]} → {dq.date_range[1]}</span>
              )}
            </div>

            <div className="pr-qual-bar-wrap">
              <div className="pr-qual-bar-labels">
                <span>Real data</span>
                <span>{dq.real_days}d &nbsp;({realPct}%)</span>
              </div>
              <div className="pr-qual-track">
                <div style={{ height: '100%', width: `${realPct}%`, background: rating.color, opacity: 0.75, borderRadius: 99 }} />
              </div>
            </div>

            <div className="pr-qual-stats">
              {([
                ['Missing days',  dq.missing_days],
                ['Outlier days',  dq.outlier_days],
                ['Stale runs',    dq.stale_days],
              ] as [string, number][]).map(([label, v]) => (
                <div key={label} className="pr-qual-stat">
                  <span className="pr-qual-stat-label">{label}</span>
                  <strong className="pr-qual-stat-val">{v}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Drivers ── */}
        {active === 'Drivers' && (
          <div className="pr-drivers">
            {drivers.slice(0, 5).map((f) => {
              const barPct = Math.round((f.importance / maxDriverImp) * 100);
              const dColor =
                f.direction === 'positive' ? 'var(--green)' :
                f.direction === 'negative' ? 'var(--red)'   : 'var(--gold)';
              const icon = f.direction === 'positive' ? '↑' : f.direction === 'negative' ? '↓' : '→';
              const name = f.feature_name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
              return (
                <div key={f.feature_name} className="pr-driver-row">
                  <div className="pr-driver-info">
                    <span className="pr-driver-name">{name}</span>
                    <span className="pr-driver-imp" style={{ color: dColor }}>
                      {icon} {(f.importance * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="pr-bar-track">
                    <div className="pr-bar-fill" style={{ width: `${barPct}%`, background: dColor }} />
                  </div>
                </div>
              );
            })}
            {recentErrorBand != null && (
              <div className="pr-driver-err">Recent MAPE: ±{recentErrorBand.toFixed(1)}%</div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
