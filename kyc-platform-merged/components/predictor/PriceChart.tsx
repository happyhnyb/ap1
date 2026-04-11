'use client';

import {
  ComposedChart, Area, Line,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

interface HistoryPoint {
  arrival_date:    string;
  avg_modal_price: number | null;
  avg_min_price:   number | null;
  avg_max_price:   number | null;
}

function fmt(n: unknown) {
  if (typeof n !== 'number') return '—';
  return `₹${(n as number).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function shortDate(d: string) {
  if (!d || d === 'Unknown') return d;
  // arrival_date is always yyyy-mm-dd at this point
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

interface TooltipPayload { name: string; value: number | number[]; color: string }

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
      <div style={{ color: 'var(--muted)', marginBottom: 8, fontWeight: 500 }}>{label}</div>
      {payload
        .filter((p) => p.name !== 'band')
        .map((p) => (
          <div key={p.name} style={{ color: p.color, marginBottom: 3 }}>
            {p.name}: {fmt(Array.isArray(p.value) ? p.value[1] : p.value)}
          </div>
        ))}
    </div>
  );
}

export default function PriceChart({ data, commodity }: { data: HistoryPoint[]; commodity: string }) {
  const valid = data.filter((d) => d.avg_modal_price !== null);

  if (!valid.length) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
        No price data for this selection. Try removing state or market filters.
      </div>
    );
  }

  // recharts v3: Area with array dataKey [low, high] draws a filled band
  const chartData = valid.map((d) => ({
    date:  shortDate(d.arrival_date),
    Modal: d.avg_modal_price,
    Min:   d.avg_min_price,
    Max:   d.avg_max_price,
    // Band for shaded range (recharts v3 range area)
    band: d.avg_min_price !== null && d.avg_max_price !== null
      ? [d.avg_min_price, d.avg_max_price]
      : null,
  }));

  const showDots = valid.length <= 10;

  return (
    <div>
      <div style={{ marginBottom: 16, fontSize: 15, fontFamily: 'Lora,serif', fontWeight: 600 }}>
        {commodity} — Price History ({valid.length} data point{valid.length !== 1 ? 's' : ''})
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#4caf50" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#4caf50" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--dim)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: 'var(--dim)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `₹${(v / 1000).toFixed(1)}k` : `₹${v}`}
            width={58}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={(value) => <span style={{ color: 'var(--muted)' }}>{value}</span>}
          />

          {/* Shaded band between min and max */}
          <Area
            type="monotone"
            dataKey="band"
            fill="url(#bandFill)"
            stroke="none"
            name="band"
            legendType="none"
            connectNulls
          />

          {/* Main modal price line */}
          <Line
            type="monotone"
            dataKey="Modal"
            stroke="#4caf50"
            strokeWidth={2.5}
            dot={showDots ? { fill: '#4caf50', r: 4 } : false}
            activeDot={{ r: 6 }}
            name="Modal Price"
            connectNulls
          />

          {/* Min / Max dashed guides */}
          <Line
            type="monotone"
            dataKey="Max"
            stroke="rgba(76,175,80,.5)"
            strokeWidth={1}
            strokeDasharray="4 3"
            dot={false}
            name="Max Price"
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="Min"
            stroke="rgba(239,83,80,.5)"
            strokeWidth={1}
            strokeDasharray="4 3"
            dot={false}
            name="Min Price"
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
