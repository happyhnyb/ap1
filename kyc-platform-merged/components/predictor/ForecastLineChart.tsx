'use client';

import React, { useMemo } from 'react';
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

function fmtDate(iso: string | number) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return String(iso);
  }
}

function fmt(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

type TooltipEntry = { name: string; value: number; color?: string };

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: TooltipEntry[] | any;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const histEntry    = payload.find((p: any) => p.name === 'History');
  const foreEntry    = payload.find((p: any) => p.name === 'Forecast');
  const lowerEntry   = payload.find((p: any) => p.name === 'CI lower');
  const upperStacked = payload.find((p: any) => p.name === 'CI band');

  if (!histEntry && !foreEntry) return null;

  const lower  = lowerEntry?.value;
  const upper  = upperStacked?.value;

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
          History: <strong style={{ color: 'var(--text)' }}>{fmt(Number(histEntry.value))}</strong>
        </div>
      )}
      {foreEntry && (
        <div style={{ marginBottom: lower != null ? 4 : 0 }}>
          <span style={{ display: 'inline-block', width: 8, height: 2, background: foreEntry.color ?? '#4caf50', marginRight: 6, verticalAlign: 'middle' }} />
          Forecast: <strong style={{ color: foreEntry.color ?? '#4caf50' }}>{fmt(Number(foreEntry.value))}</strong>
        </div>
      )}
      {lower != null && upper != null && Number(lower) > 0 && Number(upper) > 0 && (
        <div style={{ color: 'var(--dim)', marginTop: 4, fontSize: 11, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
          CI Range: {fmt(Number(lower))} – {fmt(Number(lower) + Number(upper))}
        </div>
      )}
    </div>
  );
}

export default function ForecastLineChart({ historySeries, forecast, latestPrice, commodity, direction }: Props) {
  // No data guard
  if ((!historySeries || historySeries.length === 0) && (!forecast || forecast.length === 0)) return null;

  const dirColor = direction === 'up' ? '#4caf50' : direction === 'down' ? '#ef5350' : '#ffd54f';

  // Memoize transforms to avoid rerenders and protect against empty arrays
  const { merged, connectDate } = useMemo(() => {
    const historyData = (historySeries || []).map((h) => ({
      date: h.date,
      history:  h.price,
      forecast: undefined as number | undefined,
      lower:    undefined as number | undefined,
      band:     undefined as number | undefined,
    }));

    const forecastData = (forecast || []).map((f) => ({
      date:     f.date,
      history:  undefined as number | undefined,
      forecast: f.point,
      lower:    typeof f.lower === 'number' ? f.lower : undefined,
      band:     (typeof f.upper === 'number' && typeof f.lower === 'number') ? Math.max(0, f.upper - f.lower) : undefined,
    }));

    const mergedLocal = [...historyData, ...forecastData];
    const lastHistDate = historySeries?.at(-1)?.date ?? null;

    // Bridge: if last history date != first forecast date, insert a connector point (use latestPrice)
    if (lastHistDate && latestPrice !== null && forecastData.length > 0 && forecastData[0].date !== lastHistDate) {
      mergedLocal.splice(historyData.length, 0, {
        date:     lastHistDate,
        history:  latestPrice,
        forecast: latestPrice,
        lower:    undefined,
        band:     undefined,
      });
    }

    return { merged: mergedLocal, connectDate: lastHistDate };
  }, [historySeries, forecast, latestPrice]);

  // Y-axis domain with padding; robust to empty/constant series
  const { domainMin, domainMax, tickFmt } = useMemo(() => {
    const allPrices = [
      ...(historySeries || []).map((h) => h.price),
      ...((forecast || []).flatMap((f) => [f.point, f.lower, f.upper])),
    ].filter((v) => typeof v === 'number' && !isNaN(v)) as number[];

    let minP: number;
    let maxP: number;

    if (!allPrices.length) {
      const fallback = typeof latestPrice === 'number' ? latestPrice : 100;
      minP = Math.max(0, fallback - 50);
      maxP = fallback + 50;
    } else {
      minP = Math.min(...allPrices);
      maxP = Math.max(...allPrices);
      if (minP === maxP) {
        minP = Math.max(0, minP - Math.max(10, Math.round(minP * 0.05)));
        maxP = maxP + Math.max(10, Math.round(maxP * 0.05));
      }
    }

    const pad = (maxP - minP) * 0.1 || 60;
    const dMin = Math.floor((minP - pad) / 10) * 10;
    const dMax = Math.ceil((maxP + pad) / 10) * 10;

    const tickFormatter = (v: number | string) => {
      const num = typeof v === 'number' ? v : parseFloat(String(v));
      if (Number.isNaN(num)) return String(v);
      return num >= 1000 ? `₹${(num / 1000).toFixed(1)}k` : `₹${Math.round(num)}`;
    };

    return { domainMin: dMin, domainMax: dMax, tickFmt: tickFormatter };
  }, [historySeries, forecast, latestPrice]);

  return (
    <div className="pred-chart-block" style={{ width: '100%' }}>
      {/* Legend */}
      <div className="pred-chart-legend" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span className="pred-chart-title" style={{ fontSize: 14, fontWeight: 600 }}>{commodity} · History + Forecast</span>
        <div className="pred-chart-legend-items" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--dim)' }}>
            <svg width="16" height="6" aria-hidden><line x1="0" y1="3" x2="16" y2="3" stroke="var(--muted)" strokeWidth="2"/></svg>
            <span style={{ fontSize: 13 }}>History</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="6" aria-hidden><line x1="0" y1="3" x2="16" y2="3" stroke={dirColor} strokeWidth="2" strokeDasharray="5 2"/></svg>
            <span style={{ fontSize: 13 }}>Forecast</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 7, background: dirColor, opacity: 0.18, borderRadius: 2, display: 'inline-block' }} />
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>CI</span>
          </span>
        </div>
      </div>

      {/* Explicit responsive height wrapper to avoid collapsed chart on mobile */}
      <div style={{ height: 'clamp(240px, 38vh, 420px)', marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={merged} margin={{ top: 4, right: 6, left: -4, bottom: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />

            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--dim)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmtDate}
              interval="preserveStartEnd"
              minTickGap={36}
            />
            <YAxis
              tick={{ fill: 'var(--dim)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={tickFmt}
              domain={[domainMin, domainMax]}
              width={50}
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
              isAnimationActive={false}
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
              isAnimationActive={false}
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
              isAnimationActive={false}
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
              isAnimationActive={false}
            />

            {/* Today divider */}
            {connectDate && (
              <ReferenceLine
                x={connectDate}
                stroke="var(--border2)"
                strokeDasharray="4 2"
                label={{ value: 'now', fill: 'var(--dim)', fontSize: 10, position: 'insideTopRight' } as any}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
