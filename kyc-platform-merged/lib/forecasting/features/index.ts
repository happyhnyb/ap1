/**
 * Feature engineering for mandi price time series.
 *
 * Produces a FeatureMatrix (X, y, featureNames, dates) from a TimeSeries.
 * Each row corresponds to one training sample.
 *
 * Feature groups:
 *   [0-7]   Lag features:      lag_{1,2,3,5,7,14,21,28}
 *   [8-14]  Rolling stats:     roll3_{mean,std}, roll7_{mean,std}, roll14_{mean,std}, roll28_mean
 *   [15-16] Price ratios:      ratio_7, ratio_28
 *   [17-22] Seasonality:       dow_sin/cos, woy_sin/cos, month_sin/cos
 *   [23]    State average:     cross-mandi avg for same commodity+state on same date
 *   [24]    Horizon signal:    h / 14 (set externally per horizon)
 *   [25]    Weather hook:      placeholder (default 0)
 *   [26]    Policy hook:       placeholder (default 0)
 *
 * NaN convention: A feature is NaN when it cannot be computed (insufficient history).
 * The GBRT imputes NaN with training-column means before fitting.
 */

import type { TimeSeries, FeatureMatrix } from '../schema/types';

// ── External feature hook interface ──────────────────────────────────────────

export interface ExternalFeatureHooks {
  /** Return a numeric weather anomaly score for a given date and state.
   *  Positive = anomalous wet; negative = anomalous dry.
   *  Return 0 when no data available. */
  weatherAnomalyScore(date: string, state: string): number;

  /** Return a numeric policy/event score for a given date and commodity.
   *  Examples: 1 for export ban, -1 for MSP hike.
   *  Return 0 when no event. */
  policyEventScore(date: string, commodity_id: string): number;
}

export const defaultHooks: ExternalFeatureHooks = {
  weatherAnomalyScore: () => 0,
  policyEventScore: () => 0,
};

// ── Feature names (canonical) ─────────────────────────────────────────────────

export const FEATURE_NAMES = [
  'lag_1', 'lag_2', 'lag_3', 'lag_5', 'lag_7', 'lag_14', 'lag_21', 'lag_28', // 0-7
  'roll3_mean', 'roll3_std',       // 8-9
  'roll7_mean', 'roll7_std',       // 10-11
  'roll14_mean', 'roll14_std',     // 12-13
  'roll28_mean',                   // 14
  'price_ratio_7', 'price_ratio_28', // 15-16
  'dow_sin', 'dow_cos',            // 17-18
  'woy_sin', 'woy_cos',            // 19-20
  'month_sin', 'month_cos',        // 21-22
  'state_avg',                     // 23
  'horizon_norm',                  // 24
  'weather_anomaly',               // 25
  'policy_event',                  // 26
] as const;

export type FeatureName = typeof FEATURE_NAMES[number];
export const N_FEATURES = FEATURE_NAMES.length; // 27

const LAG_OFFSETS = [1, 2, 3, 5, 7, 14, 21, 28];

// ── Numeric helpers ───────────────────────────────────────────────────────────

function nanMean(vals: (number | null)[], minObs = 1): number {
  const clean = vals.filter((v): v is number => v !== null && Number.isFinite(v));
  return clean.length >= minObs
    ? clean.reduce((s, v) => s + v, 0) / clean.length
    : NaN;
}

function nanStd(vals: (number | null)[], minObs = 2): number {
  const clean = vals.filter((v): v is number => v !== null && Number.isFinite(v));
  if (clean.length < minObs) return NaN;
  const mu = clean.reduce((s, v) => s + v, 0) / clean.length;
  const variance = clean.reduce((s, v) => s + (v - mu) ** 2, 0) / (clean.length - 1);
  return Math.sqrt(variance);
}

function weekOfYear(date: Date): number {
  const jan1 = new Date(date.getFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - jan1.getTime()) / 86_400_000 + jan1.getDay() + 1) / 7);
}

// ── Core feature vector builder ───────────────────────────────────────────────

/**
 * Compute a single feature vector for time index `t` in the price series.
 * `prices[t]` is the value at date[t]; we use data up to prices[t-1] for features.
 *
 * @param prices     Full price array (may contain null for gaps)
 * @param dates      ISO date strings parallel to prices
 * @param t          Index into prices/dates for the CURRENT date (target is prices[t+h-1])
 * @param horizon    h (1–14): used for the horizon_norm feature
 * @param stateAvg   Pre-computed cross-mandi average for same commodity+state on date[t-1]
 * @param hooks      External feature hooks
 */
function buildFeatureVector(
  prices: (number | null)[],
  dates: string[],
  t: number,
  horizon: number,
  stateAvg: number,
  hooks: ExternalFeatureHooks,
): number[] {
  const feat = new Array<number>(N_FEATURES).fill(NaN);

  // ── Lag features ──────────────────────────────────────────────────────────
  LAG_OFFSETS.forEach((k, fi) => {
    const idx = t - k;
    if (idx >= 0 && prices[idx] !== null) feat[fi] = prices[idx] as number;
  });

  // ── Rolling statistics (window ends at t-1 inclusive) ─────────────────────
  const rollOffset = 8; // feat index offset for rolling stats
  [3, 7, 14, 28].forEach((w, wi) => {
    const start = t - w;
    const slice = start >= 0 ? prices.slice(start, t) : prices.slice(0, t);
    const minObs = Math.ceil(w / 2);
    const mu  = nanMean(slice, minObs);
    const std = nanStd(slice, Math.min(minObs, 2));
    if (w <= 14) {
      feat[rollOffset + wi * 2]     = mu;
      feat[rollOffset + wi * 2 + 1] = std;
    } else {
      // roll28 occupies only 1 slot (no std at index 14)
      feat[14] = mu;
    }
  });

  // ── Price ratios ──────────────────────────────────────────────────────────
  const lag1   = feat[0];  // lag_1
  const roll7m = feat[10]; // roll7_mean
  const roll28m= feat[14]; // roll28_mean
  feat[15] = Number.isFinite(lag1) && Number.isFinite(roll7m)  && roll7m  > 0 ? (lag1 / roll7m)  - 1 : NaN;
  feat[16] = Number.isFinite(lag1) && Number.isFinite(roll28m) && roll28m > 0 ? (lag1 / roll28m) - 1 : NaN;

  // ── Seasonality ───────────────────────────────────────────────────────────
  const date = new Date(dates[t] + 'T00:00:00Z');
  const dow   = date.getUTCDay();
  const month = date.getUTCMonth() + 1; // 1-12
  const woy   = weekOfYear(date);

  feat[17] = Math.sin(2 * Math.PI * dow   / 7);
  feat[18] = Math.cos(2 * Math.PI * dow   / 7);
  feat[19] = Math.sin(2 * Math.PI * woy   / 52);
  feat[20] = Math.cos(2 * Math.PI * woy   / 52);
  feat[21] = Math.sin(2 * Math.PI * month / 12);
  feat[22] = Math.cos(2 * Math.PI * month / 12);

  // ── Spatial (state average) ───────────────────────────────────────────────
  feat[23] = Number.isFinite(stateAvg) ? stateAvg : NaN;

  // ── Horizon signal ────────────────────────────────────────────────────────
  feat[24] = horizon / 14;

  // ── External hooks ────────────────────────────────────────────────────────
  feat[25] = hooks.weatherAnomalyScore(dates[t], '');
  feat[26] = hooks.policyEventScore(dates[t], '');

  return feat;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface BuildFeaturesOptions {
  horizon: number;          // steps ahead to predict (1–14)
  stateAverages?: Map<string, number>; // date → state avg modal price
  hooks?: ExternalFeatureHooks;
  minSamples?: number;      // reject series with fewer training samples
}

/**
 * Build a FeatureMatrix for training/prediction.
 *
 * Each row t predicts prices[t + horizon - 1] using features computed from
 * prices[0..t-1].
 *
 * Minimum viable dataset:
 *   - At least lag_1 (1 day history), so t ≥ 1
 *   - Target must be non-null: prices[t + horizon - 1] must exist
 *
 * @param ts       Preprocessed TimeSeries
 * @param opts     Build options
 * @returns        FeatureMatrix ready for model training, or null if insufficient
 */
export function buildFeatureMatrix(
  ts: TimeSeries,
  opts: BuildFeaturesOptions,
): FeatureMatrix | null {
  const { horizon, stateAverages = new Map(), hooks = defaultHooks, minSamples = 5 } = opts;
  const prices = ts.points.map((p) => p.modal_price);
  const dates  = ts.points.map((p) => p.date);
  const n      = prices.length;

  const X: number[][] = [];
  const y: number[]   = [];
  const rowDates: string[] = [];

  for (let t = 1; t < n; t++) {
    const targetIdx = t + horizon - 1;
    if (targetIdx >= n) break;
    const target = prices[targetIdx];
    if (target === null || !Number.isFinite(target)) continue;

    const stateAvg = stateAverages.get(dates[t]) ?? NaN;
    const feat = buildFeatureVector(prices, dates, t, horizon, stateAvg, hooks);

    X.push(feat);
    y.push(target);
    rowDates.push(dates[t]);
  }

  if (X.length < minSamples) return null;

  return { X, y, featureNames: [...FEATURE_NAMES], dates: rowDates };
}

/**
 * Build a single feature vector for inference (no target needed).
 * `t` should be `ts.points.length` — the first unseen timestep.
 */
export function buildInferenceVector(
  ts: TimeSeries,
  horizon: number,
  targetDate: string,
  stateAvg = NaN,
  hooks: ExternalFeatureHooks = defaultHooks,
): number[] {
  const prices = ts.points.map((p) => p.modal_price);
  // Append a null placeholder so t = prices.length, dates[t] = targetDate
  const dates  = [...ts.points.map((p) => p.date), targetDate];
  const extPrices: (number | null)[] = [...prices, null];
  const t = extPrices.length - 1;
  return buildFeatureVector(extPrices, dates, t, horizon, stateAvg, hooks);
}

/**
 * Impute NaN values in X with the column means from the training set.
 * Returns the imputed matrix and the means vector (needed at inference time).
 */
export function imputeFeatures(X: number[][]): { X: number[][]; colMeans: number[] } {
  if (X.length === 0) return { X, colMeans: [] };
  const nCols = X[0].length;
  const colMeans = new Array<number>(nCols).fill(0);

  for (let c = 0; c < nCols; c++) {
    const vals = X.map((row) => row[c]).filter((v) => Number.isFinite(v));
    colMeans[c] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  }

  const imputed = X.map((row) =>
    row.map((v, c) => (Number.isFinite(v) ? v : colMeans[c]))
  );

  return { X: imputed, colMeans };
}

/**
 * Apply column means (from training) to impute a single inference vector.
 */
export function imputeVector(x: number[], colMeans: number[]): number[] {
  return x.map((v, c) => (Number.isFinite(v) ? v : (colMeans[c] ?? 0)));
}
