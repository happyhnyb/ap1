/**
 * Feature engineering for mandi price time series.
 *
 * Features are horizon-safe: every row uses information available at the
 * forecast origin only. Calendar features use the target date because the
 * future calendar is known ex ante.
 */

import type { TimeSeries, FeatureMatrix } from '../schema/types';

export interface ExternalFeatureHooks {
  weatherAnomalyScore(date: string, state: string): number;
  policyEventScore(date: string, commodity_id: string): number;
}

export const defaultHooks: ExternalFeatureHooks = {
  weatherAnomalyScore: () => 0,
  policyEventScore: () => 0,
};

export const FEATURE_NAMES = [
  'lag_1', 'lag_2', 'lag_3', 'lag_5', 'lag_7', 'lag_14', 'lag_21', 'lag_28',
  'delta_1', 'delta_7', 'return_1', 'return_7', 'momentum_14',
  'roll3_mean', 'roll7_mean', 'roll14_mean', 'roll28_mean',
  'roll7_median', 'roll14_median',
  'roll7_std', 'roll14_std', 'roll28_std',
  'roll7_min', 'roll7_max', 'roll14_min', 'roll14_max',
  'arrivals_lag_1', 'arrivals_roll7_mean', 'arrivals_roll14_mean',
  'freshness_hours', 'missing_ratio_7',
  'is_imputed_recent', 'is_outlier_recent', 'is_stale_recent', 'is_gap_recent',
  'state_avg_lag1', 'spread_to_state_lag1',
  'dow_sin', 'dow_cos', 'woy_sin', 'woy_cos', 'month_sin', 'month_cos',
  'horizon_norm', 'weather_anomaly', 'policy_event',
] as const;

export const N_FEATURES = FEATURE_NAMES.length;

const LAG_OFFSETS = [1, 2, 3, 5, 7, 14, 21, 28];

function valid(values: (number | null)[]): number[] {
  return values.filter((value): value is number => value !== null && Number.isFinite(value));
}

function mean(values: (number | null)[], minObs = 1): number {
  const clean = valid(values);
  return clean.length >= minObs ? clean.reduce((sum, value) => sum + value, 0) / clean.length : NaN;
}

function median(values: (number | null)[], minObs = 1): number {
  const clean = valid(values).sort((left, right) => left - right);
  if (clean.length < minObs) return NaN;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

function std(values: (number | null)[], minObs = 2): number {
  const clean = valid(values);
  if (clean.length < minObs) return NaN;
  const mu = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const variance = clean.reduce((sum, value) => sum + (value - mu) ** 2, 0) / (clean.length - 1);
  return Math.sqrt(Math.max(variance, 0));
}

function minValue(values: (number | null)[], minObs = 1): number {
  const clean = valid(values);
  return clean.length >= minObs ? Math.min(...clean) : NaN;
}

function maxValue(values: (number | null)[], minObs = 1): number {
  const clean = valid(values);
  return clean.length >= minObs ? Math.max(...clean) : NaN;
}

function weekOfYear(date: Date): number {
  const jan1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - jan1.getTime()) / 86_400_000 + jan1.getUTCDay() + 1) / 7);
}

function sliceWindow<T>(values: T[], endExclusive: number, window: number): T[] {
  const start = Math.max(0, endExclusive - window);
  return values.slice(start, endExclusive);
}

function recentMissingRatio(ts: TimeSeries, endExclusive: number, window: number): number {
  const slice = sliceWindow(ts.points, endExclusive, window);
  if (!slice.length) return 0;
  const missing = slice.filter((point) => point.modal_price === null).length;
  return missing / slice.length;
}

function recentFlagRatio(
  ts: TimeSeries,
  endExclusive: number,
  window: number,
  predicate: (point: TimeSeries['points'][number]) => boolean,
): number {
  const slice = sliceWindow(ts.points, endExclusive, window);
  if (!slice.length) return 0;
  return slice.filter(predicate).length / slice.length;
}

function buildFeatureVector(
  ts: TimeSeries,
  prices: (number | null)[],
  arrivals: (number | null)[],
  dates: string[],
  anchorIndex: number,
  horizon: number,
  targetDate: string,
  stateAverages: Map<string, number>,
  hooks: ExternalFeatureHooks,
): number[] {
  const features = new Array<number>(N_FEATURES).fill(NaN);

  LAG_OFFSETS.forEach((offset, featureIndex) => {
    const priceIndex = anchorIndex - offset;
    if (priceIndex >= 0 && prices[priceIndex] !== null) features[featureIndex] = prices[priceIndex] as number;
  });

  const lag1 = features[0];
  const lag2 = features[1];
  const lag7 = features[4];
  const lag14 = features[5];

  features[8] = Number.isFinite(lag1) && Number.isFinite(lag2) ? lag1 - lag2 : NaN;
  features[9] = Number.isFinite(lag1) && Number.isFinite(lag7) ? lag1 - lag7 : NaN;
  features[10] = Number.isFinite(lag1) && Number.isFinite(lag2) && lag2 !== 0 ? (lag1 - lag2) / lag2 : NaN;
  features[11] = Number.isFinite(lag1) && Number.isFinite(lag7) && lag7 !== 0 ? (lag1 - lag7) / lag7 : NaN;
  features[12] = Number.isFinite(lag1) && Number.isFinite(lag14) && lag14 !== 0 ? (lag1 - lag14) / lag14 : NaN;

  const roll3 = sliceWindow(prices, anchorIndex, 3);
  const roll7 = sliceWindow(prices, anchorIndex, 7);
  const roll14 = sliceWindow(prices, anchorIndex, 14);
  const roll28 = sliceWindow(prices, anchorIndex, 28);

  features[13] = mean(roll3, 2);
  features[14] = mean(roll7, 4);
  features[15] = mean(roll14, 7);
  features[16] = mean(roll28, 10);
  features[17] = median(roll7, 4);
  features[18] = median(roll14, 7);
  features[19] = std(roll7, 4);
  features[20] = std(roll14, 7);
  features[21] = std(roll28, 10);
  features[22] = minValue(roll7, 4);
  features[23] = maxValue(roll7, 4);
  features[24] = minValue(roll14, 7);
  features[25] = maxValue(roll14, 7);

  const arrivalsLagIndex = anchorIndex - 1;
  if (arrivalsLagIndex >= 0 && arrivals[arrivalsLagIndex] !== null) features[26] = arrivals[arrivalsLagIndex] as number;
  features[27] = mean(sliceWindow(arrivals, anchorIndex, 7), 2);
  features[28] = mean(sliceWindow(arrivals, anchorIndex, 14), 4);

  features[29] = ts.points[Math.max(0, anchorIndex - 1)]?.freshness_hours ?? NaN;
  features[30] = recentMissingRatio(ts, anchorIndex, 7);
  features[31] = recentFlagRatio(ts, anchorIndex, 7, (point) => point.quality.is_imputed);
  features[32] = recentFlagRatio(ts, anchorIndex, 14, (point) => point.quality.is_outlier);
  features[33] = recentFlagRatio(ts, anchorIndex, 14, (point) => point.quality.is_stale);
  features[34] = recentFlagRatio(ts, anchorIndex, 14, (point) => point.quality.is_price_gap);

  const anchorDate = dates[Math.max(0, anchorIndex - 1)];
  const stateAvgLag = stateAverages.get(anchorDate ?? '') ?? NaN;
  features[35] = stateAvgLag;
  features[36] = Number.isFinite(lag1) && Number.isFinite(stateAvgLag) ? lag1 - stateAvgLag : NaN;

  const target = new Date(`${targetDate}T00:00:00Z`);
  const dow = target.getUTCDay();
  const woy = weekOfYear(target);
  const month = target.getUTCMonth() + 1;
  features[37] = Math.sin((2 * Math.PI * dow) / 7);
  features[38] = Math.cos((2 * Math.PI * dow) / 7);
  features[39] = Math.sin((2 * Math.PI * woy) / 52);
  features[40] = Math.cos((2 * Math.PI * woy) / 52);
  features[41] = Math.sin((2 * Math.PI * month) / 12);
  features[42] = Math.cos((2 * Math.PI * month) / 12);

  features[43] = horizon / 14;
  features[44] = hooks.weatherAnomalyScore(anchorDate ?? targetDate, ts.state);
  features[45] = hooks.policyEventScore(anchorDate ?? targetDate, ts.commodity_id);

  return features;
}

export interface BuildFeaturesOptions {
  horizon: number;
  stateAverages?: Map<string, number>;
  hooks?: ExternalFeatureHooks;
  minSamples?: number;
}

export function buildFeatureMatrix(ts: TimeSeries, opts: BuildFeaturesOptions): FeatureMatrix | null {
  const { horizon, stateAverages = new Map(), hooks = defaultHooks, minSamples = 8 } = opts;
  const prices = ts.points.map((point) => point.modal_price);
  const arrivals = ts.points.map((point) => point.arrivals);
  const dates = ts.points.map((point) => point.date);
  const X: number[][] = [];
  const y: number[] = [];
  const rowDates: string[] = [];

  for (let anchorIndex = 14; anchorIndex < prices.length; anchorIndex++) {
    const targetIndex = anchorIndex + horizon - 1;
    if (targetIndex >= prices.length) break;
    const target = prices[targetIndex];
    if (target === null || !Number.isFinite(target)) continue;

    const targetDate = dates[targetIndex];
    const row = buildFeatureVector(ts, prices, arrivals, dates, anchorIndex, horizon, targetDate, stateAverages, hooks);
    X.push(row);
    y.push(target);
    rowDates.push(targetDate);
  }

  if (X.length < minSamples) return null;
  return { X, y, featureNames: [...FEATURE_NAMES], dates: rowDates };
}

export function buildInferenceVector(
  ts: TimeSeries,
  horizon: number,
  targetDate: string,
  stateAvg = NaN,
  hooks: ExternalFeatureHooks = defaultHooks,
): number[] {
  const prices = ts.points.map((point) => point.modal_price);
  const arrivals = ts.points.map((point) => point.arrivals);
  const dates = ts.points.map((point) => point.date);
  const stateAverages = Number.isFinite(stateAvg) && dates.length
    ? new Map<string, number>([[dates.at(-1)!, stateAvg]])
    : new Map<string, number>();
  return buildFeatureVector(ts, prices, arrivals, dates, prices.length, horizon, targetDate, stateAverages, hooks);
}

export function imputeFeatures(X: number[][]): { X: number[][]; colMeans: number[] } {
  if (!X.length) return { X, colMeans: [] };
  const colMeans = X[0].map((_, column) => {
    const values = X.map((row) => row[column]).filter((value) => Number.isFinite(value));
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  });
  return {
    X: X.map((row) => row.map((value, column) => (Number.isFinite(value) ? value : colMeans[column]))),
    colMeans,
  };
}

export function imputeVector(x: number[], colMeans: number[]): number[] {
  return x.map((value, column) => (Number.isFinite(value) ? value : (colMeans[column] ?? 0)));
}
