'use client';

import {
  ComposedChart, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

interface HistoryPoint { date: string; price: number }
interface ForecastPoint { date: string; point: number; lower: number; upper: number }

interface Props {
  historySeries: HistoryPoint[];
  forecast: ForecastPoint[];
  latestPrice: number | null;
  commodity: string;
  direction: 'up' | 'down' | 'flat';
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function fmt(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

// Custom tooltip
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg3)',
      border: '1px solid var(--border2)',
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 12,
      minWidth: 140,
    }}>
      <div style={{ color: 'var(--dim)', marginBottom: 6 }}>{label ? fmtDate(label) : ''}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {fmt(p.value)}
        </div>
      ))}
    </div>
  );
}

export default function ForecastLineChart({ historySeries, forecast, latestPrice, commodity, direction }: Props) {
  if (!historySeries.length && !forecast.length) return null;

  const dirColor = direction === 'up' ? '#4caf50' : direction === 'down' ? '#ef5350' : '#ffd54f';

  // Build unified data array: history + forecast
  const historyData = historySeries.map((h) => ({
    date: h.date,
    history: h.price,
    forecast: undefined as number | undefined,
    lower: undefined as number | undefined,
    band: undefined as number | undefined,
  }));

  // Add a connecting point so history and forecast lines meet
  const connectDate = historySeries.at(-1)?.date ?? null;

  const forecastData = forecast.map((f) => ({
    date: f.date,
    history: undefined as number | undefined,
    forecast: f.point,
    lower: f.lower,
    band: Math.max(0, f.upper - f.lower),
  }));

  // Attach latest history price to first forecast date for a smooth join
  const merged = [...historyData, ...forecastData];

  // If we have a latest price and a gap between history and forecast, bridge it
  if (connectDate && latestPrice !== null && forecast.length > 0) {
    // Find if the first forecast date is different from last history date
    const firstForecastDate = forecast[0].date;
    if (firstForecastDate !== connectDate) {
      // Insert a bridge point
      merged.splice(historyData.length, 0, {
        date: connectDate,
        history: latestPrice,
        forecast: latestPrice,
        lower: undefined,
        band: undefined,
      });
    }
  }

  // Derive Y-axis domain
  const allPrices = [
    ...historySeries.map((h) => h.price),
    ...forecast.map((f) => f.point),
    ...forecast.map((f) => f.lower),
    ...forecast.map((f) => f.upper),
  ].filter((v) => typeof v === 'number' && !isNaN(v));

  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const pad  = (maxP - minP) * 0.08 || 50;
  const domainMin = Math.floor((minP - pad) / 10) * 10;
  const domainMax = Math.ceil((maxP + pad) / 10) * 10;

  const tickFormatter = (v: number) =>
    v >= 1000 ? `₹${(v / 1000).toFixed(1)}k` : `₹${v}`;

  // Determine split date for reference line
  const splitDate = historySeries.at(-1)?.date ?? null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'Lora,serif', fontSize: 15, fontWeight: 600 }}>{commodity} — Price History + Forecast</span>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--dim)' }}>
          <span>
            <svg width="16" height="3" style={{ verticalAlign: 'middle', marginRight: 4 }}>
              <line x1="0" y1="1.5" x2="16" y2="1.5" stroke="var(--muted)" strokeWidth="2"/>
            </svg>
            History
          </span>
          <span>
            <svg width="16" height="3" style={{ verticalAlign: 'middle', marginRight: 4 }}>
              <line x1="0" y1="1.5" x2="16" y2="1.5" stroke={dirColor} strokeWidth="2" strokeDasharray="4 2"/>
            </svg>
            Forecast
          </span>
          <span style={{ color: dirColor, opacity: 0.7 }}>■ Confidence band</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={merged} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />

          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--dim)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtDate}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: 'var(--dim)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={tickFormatter}
            domain={[domainMin, domainMax]}
            width={56}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* Confidence band: stack lower (transparent) + band (fill) */}
          <Area
            dataKey="lower"
            stroke="none"
            fill="transparent"
            stackId="ci"
            dot={false}
            activeDot={false}
            legendType="none"
            name="CI lower"
          />
          <Area
            dataKey="band"
            stroke="none"
            fill={dirColor}
            fillOpacity={0.13}
            stackId="ci"
            dot={false}
            activeDot={false}
            legendType="none"
            name="CI band"
          />

          {/* Historical price line */}
          <Line
            dataKey="history"
            stroke="var(--muted)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: 'var(--muted)' }}
            connectNulls={false}
            name="History"
          />

          {/* Forecast line */}
          <Line
            dataKey="forecast"
            stroke={dirColor}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 4, fill: dirColor }}
            connectNulls={false}
            name="Forecast"
          />

          {/* Vertical split line at history/forecast boundary */}
          {splitDate && (
            <ReferenceLine
              x={splitDate}
              stroke="var(--border2)"
              strokeDasharray="4 2"
              label={{ value: 'Today', fill: 'var(--dim)', fontSize: 10, position: 'top' }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
