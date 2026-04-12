'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';

export interface MarketPoint {
  market:      string;
  state:       string;
  district:    string;
  modal_price: number | null;
  min_price:   number | null;
  max_price:   number | null;
}

function fmt(n: unknown) {
  if (typeof n !== 'number') return '—';
  return `₹${(n as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

interface TooltipPayload { name: string; value: number; payload: MarketPoint }

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, minWidth: 160 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{m.market}</div>
      <div style={{ color: 'var(--dim)', fontSize: 12, marginBottom: 8 }}>{m.district}, {m.state}</div>
      <div style={{ color: '#4caf50', fontWeight: 600 }}>Modal: {fmt(m.modal_price)}</div>
      {m.min_price !== null && <div style={{ color: 'var(--muted)', fontSize: 12 }}>Min: {fmt(m.min_price)}</div>}
      {m.max_price !== null && <div style={{ color: 'var(--muted)', fontSize: 12 }}>Max: {fmt(m.max_price)}</div>}
    </div>
  );
}

export default function PriceChart({ data, commodity }: { data: MarketPoint[]; commodity: string }) {
  if (!data.length) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
        No price data for this selection. Try removing state or market filters.
      </div>
    );
  }

  // Show top 15 markets sorted by modal price (highest first = best market)
  const chartData = data.slice(0, 15);
  const prices    = chartData.map((d) => d.modal_price ?? 0);
  const minP      = Math.min(...prices);
  const maxP      = Math.max(...prices);
  const midP      = (minP + maxP) / 2;

  const getColor = (price: number | null) => {
    if (price === null) return '#666';
    if (price >= midP + (maxP - midP) * 0.5) return '#4caf50';
    if (price <= midP - (midP - minP) * 0.5) return '#ef5350';
    return '#ffd54f';
  };

  // Shorten long market names for the chart
  const shorten = (s: string) => s.replace(/ APMC$| Mandi$| Market$/, '').slice(0, 16);

  const display = chartData.map((d) => ({ ...d, label: shorten(d.market) }));

  return (
    <div>
      <div style={{ marginBottom: 4, fontSize: 15, fontFamily: 'Lora,serif', fontWeight: 600 }}>
        {commodity} — Today&apos;s Prices by Market
      </div>
      <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 16 }}>
        Top {chartData.length} markets by modal price · ₹/quintal ·{' '}
        <span style={{ color: '#4caf50' }}>● high</span>{' '}
        <span style={{ color: '#ffd54f' }}>● mid</span>{' '}
        <span style={{ color: '#ef5350' }}>● low</span>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(260, chartData.length * 28)}>
        <BarChart
          data={display}
          layout="vertical"
          margin={{ top: 0, right: 70, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: 'var(--dim)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `₹${(v / 1000).toFixed(1)}k` : `₹${v}`}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={110}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey="modal_price" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {display.map((entry, i) => (
              <Cell key={i} fill={getColor(entry.modal_price)} fillOpacity={0.85} />
            ))}
            <LabelList
              dataKey="modal_price"
              position="right"
              formatter={(v: unknown) => fmt(v)}
              style={{ fill: 'var(--muted)', fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
