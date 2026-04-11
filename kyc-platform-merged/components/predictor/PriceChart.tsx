'use client';

import {
  ComposedChart, Area, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface HistoryPoint {
  arrival_date: string;
  avg_modal_price: number | null;
  avg_min_price: number | null;
  avg_max_price: number | null;
}

function fmt(n: unknown) {
  if (typeof n !== 'number') return '—';
  return `₹${(n as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function shortDate(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
      <div style={{ color: 'var(--muted)', marginBottom: 8, fontWeight: 500 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, marginBottom: 4 }}>
          {p.name}: {fmt(p.value)}
        </div>
      ))}
    </div>
  );
}

export default function PriceChart({ data, commodity }: { data: HistoryPoint[]; commodity: string }) {
  const chartData = data
    .filter((d) => d.avg_modal_price !== null)
    .map((d) => ({
      date: shortDate(d.arrival_date),
      Modal: d.avg_modal_price,
      Min: d.avg_min_price,
      Max: d.avg_max_price,
    }));

  if (!chartData.length) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
      No price data for this selection.
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 16, fontSize: 15, fontFamily: 'Lora,serif', fontWeight: 600 }}>
        {commodity} — 30-Day Price History
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fill: 'var(--dim)', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: 'var(--dim)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${(v as number / 1000).toFixed(1)}k`} width={54} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted)' }} />
          <Area type="monotone" dataKey="Max" fill="rgba(76,175,80,.08)" stroke="none" name="Max" legendType="none" />
          <Area type="monotone" dataKey="Min" fill="var(--bg)" stroke="none" name="Min" legendType="none" />
          <Line type="monotone" dataKey="Modal" stroke="#4caf50" strokeWidth={2} dot={false} name="Modal Price" />
          <Line type="monotone" dataKey="Max" stroke="rgba(76,175,80,.35)" strokeWidth={1} strokeDasharray="4 3" dot={false} name="Max Price" />
          <Line type="monotone" dataKey="Min" stroke="rgba(239,83,80,.35)" strokeWidth={1} strokeDasharray="4 3" dot={false} name="Min Price" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
