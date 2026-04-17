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
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function fmt(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

type TooltipEntry = { name: string; value: number; color?: string };

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  // CI band is stacked: 'CI lower' = lower bound, 'CI band' stacked value = upper bound
  const histEntry    = payload.find((p) => p.name === 'History');
  const foreEntry    = payload.find((p) => p.name === 'Forecast');
  const lowerEntry   = payload.find((p) => p.name === 'CI lower');
  const upperStacked = payload.find((p) => p.name === 'CI band');

  if (!histEntry && !foreEntry) return null;

  const lower  = lowerEntry?.value;
  const upper  = upperStacked?.value; // stacked = actual upper

  return (
    <div style={{
      background: 'var(--bg3)',
      border: '1px solid var(--border2)',
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 12,
      minWidth: 150,
    }}>
      <div style={{ color: 'var(--dim)', marginBottom: 8, fontWeight: 500 }}>
        {label ? fmtDate(label) : ''}
      </div>
      {histEntry && (
        <div style={{ color: 'var(--muted)', marginBottom: 4 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--muted)', marginRight: 6 }} />
          History: <strong style={{ color: 'var(--text)' }}>{fmt(histEntry.value)}</strong>
        </div>
      )}
      {foreEntry && (
        <div style={{ marginBottom: lower != null ? 4 : 0 }}>
          <span style={{ display: 'inline-block', width: 8, height: 2, background: foreEntry.color ?? '#4caf50', marginRight: 6, verticalAlign: 'middle' }} />
          Forecast: <strong style={{ color: foreEntry.color ?? '#4caf50' }}>{fmt(foreEntry.value)}</strong>
        </div>
      )}
      {lower != null && upper != null && (
        <div style={{ color: 'var(--dim)', marginTop: 4, fontSize: 11, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
          Range: {fmt(lower)} – {fmt(upper)}
        </div>
      )}
    </div>
  );
}

export default function ForecastLineChart({ historySeries, forecast, latestPrice, commodity, direction }: Props) {
  if (!historySeries.length && !forecast.length) return null;

  const dirColor = direction === 'up' ? '#4caf50' : direction === 'down' ? '#ef5350' : '#ffd54f';

  // Build data: history dates
  const historyData = historySeries.map((h) => ({
    date: h.date,
    history:  h.price,
    forecast: undefined as number | undefined,
    lower:    undefined as number | undefined,
    band:     undefined as number | undefined,
  }));

  const connectDate = historySeries.at(-1)?.date ?? null;

  // Forecast dates
  const forecastData = forecast.map((f) => ({
    date:     f.date,
    history:  undefined as number | undefined,
    forecast: f.point,
    lower:    f.lower,
    band:     Math.max(0, f.upper - f.lower),
  }));

  const merged = [...historyData, ...forecastData];

  // Bridge: if last history date != first forecast date, insert a connector point
  if (connectDate && latestPrice !== null && forecast.length > 0 && forecast[0].date !== connectDate) {
    merged.splice(historyData.length, 0, {
      date:     connectDate,
      history:  latestPrice,
      forecast: latestPrice,
      lower:    undefined,
      band:     undefined,
    });
  }

  // Y-axis domain with padding
  const allPrices = [
    ...historySeries.map((h) => h.price),
    ...forecast.flatMap((f) => [f.point, f.lower, f.upper]),
  ].filter((v) => typeof v === 'number' && !isNaN(v));

  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const pad  = (maxP - minP) * 0.1 || 60;
  const domainMin = Math.floor((minP - pad) / 10) * 10;
  const domainMax = Math.ceil((maxP + pad) / 10) * 10;

  const tickFmt = (v: number) => v >= 1000 ? `₹${(v / 1000).toFixed(1)}k` : `₹${v}`;

  return (
    <div className="pred-chart-block">
      {/* Legend */}
      <div className="pred-chart-legend">
        <span className="pred-chart-title">{commodity} · History + Forecast</span>
        <div className="pred-chart-legend-items">
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="16" height="2"><line x1="0" y1="1" x2="16" y2="1" stroke="var(--muted)" strokeWidth="2"/></svg>
            History
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="16" height="2"><line x1="0" y1="1" x2="16" y2="1" stroke={dirColor} strokeWidth="2" strokeDasharray="5 2"/></svg>
            Forecast
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 7, background: dirColor, opacity: 0.18, borderRadius: 2, display: 'inline-block' }} />
            CI
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={merged} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />

          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--dim)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtDate}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis
            tick={{ fill: 'var(--dim)', fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={tickFmt}
            domain={[domainMin, domainMax]}
            width={44}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* Confidence band: lower (transparent base) + band (fill) stacked */}
          <Area
            dataKey="lower"
            stroke="none"
            fill="transparent"
            stackId="ci"
            dot={false}
            activeDot={false}
            legendType="none"
            name="CI lower"
            connectNulls={false}
          />
          <Area
            dataKey="band"
            stroke="none"
            fill={dirColor}
            fillOpacity={0.14}
            stackId="ci"
            dot={false}
            activeDot={false}
            legendType="none"
            name="CI band"
            connectNulls={false}
          />

          {/* Historical price line */}
          <Line
            dataKey="history"
            stroke="var(--muted)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, fill: 'var(--muted)', stroke: 'var(--bg2)', strokeWidth: 2 }}
            connectNulls={false}
            name="History"
          />

          {/* Forecast line (dashed) */}
          <Line
            dataKey="forecast"
            stroke={dirColor}
            strokeWidth={2.5}
            strokeDasharray="6 3"
            dot={{ r: 3, fill: dirColor, stroke: 'var(--bg2)', strokeWidth: 1.5 }}
            activeDot={{ r: 6, fill: dirColor, stroke: 'var(--bg2)', strokeWidth: 2 }}
            connectNulls={false}
            name="Forecast"
          />

          {/* Today divider */}
          {connectDate && (
            <ReferenceLine
              x={connectDate}
              stroke="var(--border2)"
              strokeDasharray="4 2"
              label={{ value: 'now', fill: 'var(--dim)', fontSize: 9, position: 'insideTopRight' }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
