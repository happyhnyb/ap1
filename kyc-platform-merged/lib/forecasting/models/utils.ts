import type { TimeSeries, ForecastPoint } from '../schema/types';

export type ObservedPoint = {
  date: string;
  price: number;
  arrivals: number | null;
  quality: TimeSeries['points'][number]['quality'];
};

export function getObservedPoints(ts: TimeSeries): ObservedPoint[] {
  return ts.points
    .filter((point) => point.modal_price !== null)
    .map((point) => ({
      date: point.date,
      price: point.modal_price as number,
      arrivals: point.arrivals,
      quality: point.quality,
    }));
}

export function getObservedPrices(ts: TimeSeries): number[] {
  return getObservedPoints(ts).map((point) => point.price);
}

export function getLastObservedDate(ts: TimeSeries): string | null {
  return getObservedPoints(ts).at(-1)?.date ?? null;
}

export function addDaysIso(anchorIso: string, days: number): string {
  const next = new Date(`${anchorIso}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function forecastDatesFromSeries(ts: TimeSeries, horizon: number): string[] {
  const anchor = getLastObservedDate(ts) ?? new Date().toISOString().slice(0, 10);
  return Array.from({ length: horizon }, (_, index) => addDaysIso(anchor, index + 1));
}

export function sampleStd(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

export function recentReturnVolatility(prices: number[], window = 14): number {
  if (prices.length < 3) return 0;
  const slice = prices.slice(-Math.max(window, 3));
  const returns: number[] = [];
  for (let index = 1; index < slice.length; index++) {
    const prev = slice[index - 1];
    const next = slice[index];
    if (prev > 0) returns.push((next - prev) / prev);
  }
  return sampleStd(returns);
}

export function robustResidualScale(residuals: number[]): number {
  const clean = residuals.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return 0;

  const sorted = [...clean].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = sorted.map((value) => Math.abs(value - median)).sort((left, right) => left - right);
  const mad = deviations[Math.floor(deviations.length / 2)] ?? 0;
  if (mad > 0) return mad * 1.4826;
  return sampleStd(clean);
}

export function stalePenalty(ts: TimeSeries): number {
  const total = Math.max(ts.points.length, 1);
  const staleOrImputed = ts.points.filter((point) => point.quality.is_stale || point.quality.is_imputed).length;
  const outliers = ts.points.filter((point) => point.quality.is_outlier || point.quality.is_price_gap).length;
  return 1 + staleOrImputed / total + outliers / (2 * total);
}

export function intervalHalfWidth(
  residualScale: number,
  prices: number[],
  horizon: number,
  ts: TimeSeries,
  multiplier = 1.28,
): number {
  const volatility = recentReturnVolatility(prices);
  const latestPrice = prices.at(-1) ?? 0;
  const volatilityFloor = latestPrice * volatility * Math.sqrt(Math.max(1, horizon));
  const freshnessPenalty = ts.freshness === 'stale' ? 1.2 : ts.freshness === 'insufficient' ? 1.35 : 1;
  const qualityPenalty = stalePenalty(ts);
  const growth = 1 + (horizon - 1) * 0.06;
  const base = Math.max(residualScale, volatilityFloor);
  return Math.max(0, base * multiplier * freshnessPenalty * qualityPenalty * growth);
}

export function boundedForecastPoint(point: number, halfWidth: number, date: string, horizon: number): ForecastPoint {
  const center = Math.max(0, Math.round(point * 100) / 100);
  const width = Math.max(0, Math.round(halfWidth * 100) / 100);
  return {
    date,
    horizon_days: horizon,
    point: center,
    lower: Math.max(0, Math.round((center - width) * 100) / 100),
    upper: Math.round((center + width) * 100) / 100,
  };
}
