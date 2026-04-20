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

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: any[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const histEntry    = payload.find((p: any) => p.name === 'History');
  const foreEntry    = payload.find((p: any) => p.name === 'Forecast');
  const lowerEntry   = payload.find((p: any) => p.name === 'CI lower');
  const upperStacked = payload.find((p: any) => p.name === 'CI band');

  if (!histEntry && !foreEntry) return null;

  const lower = lowerEntry?.value;
  const upper = upperStacked?.value;

  return (
    <div className="pr-tooltip">
      <div className="pr-tooltip-date">{label ? fmtDate(label) : ''}</div>
      {histEntry && (
        <div className="pr-tooltip-row">
          <span className="pr-tooltip-dot" style={{ background: 'var(--muted)' }} />
          <span className="pr-tooltip-name">History</span>
          <strong className="pr-tooltip-val">{fmt(Number(histEntry.value))}</strong>
        </div>
      )}
      {foreEntry && (
        <div className="pr-tooltip-row">
          <span className="pr-tooltip-dash" style={{ background: foreEntry.color ?? '#4caf50' }} />
          <span className="pr-tooltip-name">Forecast</span>
          <strong className="pr-tooltip-val" style={{ color: foreEntry.color ?? '#4caf50' }}>
            {fmt(Number(foreEntry.value))}
          </strong>
        </div>
      )}
      {lower != null && upper != null && Number(lower) > 0 && Number(upper) > 0 && (
        <div className="pr-tooltip-ci">
          {fmt(Number(lower))} – {fmt(Number(lower) + Number(upper))}
        </div>
      )}
    </div>
  );
}

export default function ForecastLineChart({ historySeries, forecast, latestPrice, direction }: Props) {
  if ((!historySeries || historySeries.length === 0) && (!forecast || forecast.length === 0)) return null;

  const dirColor = direction === 'up' ? '#4caf50' : direction === 'down' ? '#ef5350' : '#ffd54f';

  const { merged, connectDate } = useMemo(() => {
    const historyData = (historySeries || []).map((h) => ({
      date:     h.date,
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

  const { domainMin, domainMax, tickFmt } = useMemo(() => {
    // Use only actual price points (not CI bounds) so the band doesn't push the axis out
    const allPrices = [
      ...(historySeries || []).map((h) => h.price),
      ...(forecast || []).map((f) => f.point),
    ].filter((v) => typeof v === 'number' && !isNaN(v)) as number[];

    let minP: number, maxP: number;

    if (!allPrices.length) {
      const fallback = typeof latestPrice === 'number' ? latestPrice : 100;
      minP = Math.max(0, fallback - 50);
      maxP = fallback + 50;
    } else {
      minP = Math.min(...allPrices);
      maxP = Math.max(...allPrices);
      if (minP === maxP) {
        minP = Math.max(0, minP - Math.max(10, Math.round(minP * 0.03)));
        maxP = maxP + Math.max(10, Math.round(maxP * 0.03));
      }
    }

    const pad = (maxP - minP) * 0.05 || 30;
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
    <div className="pr-chart">
      {/* Legend */}
      <div className="pr-chart-legend">
        <span className="pr-chart-legend-item">
          <span className="pr-legend-line pr-legend-history" />
          History
        </span>
        <span className="pr-chart-legend-item">
          <span className="pr-legend-line pr-legend-forecast" style={{ background: dirColor }} />
          Forecast
        </span>
        <span className="pr-chart-legend-item">
          <span className="pr-legend-band" style={{ background: dirColor }} />
          CI band
        </span>
      </div>

      <div className="pr-chart-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={merged} margin={{ top: 4, right: 6, left: -10, bottom: 4 }}>
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
              tick={{ fill: 'var(--dim)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={tickFmt}
              domain={[domainMin, domainMax]}
              width={46}
            />

            {/* Tooltip positioned to never clip on mobile */}
            <Tooltip
              content={<CustomTooltip />}
              allowEscapeViewBox={{ x: false, y: true }}
              position={{ y: 0 }}
            />

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
              fillOpacity={0.11}
              stackId="ci"
              dot={false}
              activeDot={false}
              legendType="none"
              name="CI band"
              connectNulls={false}
              isAnimationActive={false}
            />

            <Line
              dataKey="history"
              stroke="var(--muted)"
              strokeWidth={1.75}
              dot={false}
              activeDot={{ r: 4, fill: 'var(--muted)', stroke: 'var(--bg2)', strokeWidth: 2 }}
              connectNulls={false}
              name="History"
              isAnimationActive={false}
            />

            <Line
              dataKey="forecast"
              stroke={dirColor}
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={{ r: 2, fill: dirColor, stroke: 'var(--bg2)', strokeWidth: 1.5 }}
              activeDot={{ r: 4, fill: dirColor, stroke: 'var(--bg2)', strokeWidth: 2 }}
              connectNulls={false}
              name="Forecast"
              isAnimationActive={false}
            />

            {connectDate && (
              <ReferenceLine
                x={connectDate}
                stroke="var(--border2)"
                strokeDasharray="4 2"
                label={{ value: 'now', fill: 'var(--dim)', fontSize: 9, position: 'insideTopRight' } as any}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
