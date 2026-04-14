/**
 * Rolling-origin cross-validation backtester.
 *
 * For each origin t in the validation window:
 *   1. Train the model on ts.points[0 : t]
 *   2. Predict horizons 1..H from time t
 *   3. Evaluate against actual ts.points[t : t+H]
 *
 * Origins slide by 1 day. The first origin is at index:
 *   max(model.minDataPoints, MIN_TRAIN_WINDOW)
 *
 * Returns aggregated BacktestMetrics (averaged across all origins).
 * Also returns per-horizon metrics for quality reporting.
 *
 * NOTE: This is compute-intensive. Cache results in the engine layer.
 */

import type { TimeSeries, BacktestMetrics } from '../schema/types';
import type { ForecastModel } from '../models/interface';
import { computeMetrics } from './metrics';

const MIN_TRAIN_WINDOW = 14; // absolute minimum training points
const MAX_HORIZONS = 14;

export interface BacktestResult {
  /** Metrics aggregated across all origins and all horizons. */
  overall: BacktestMetrics;
  /** Metrics per horizon step (key = horizon day). */
  byHorizon: Map<number, BacktestMetrics>;
  /** Number of valid origins used. */
  n_origins: number;
}

interface OriginResult {
  horizon: number;
  actual:    number;
  predicted: number;
  lower:     number;
  upper:     number;
}

/**
 * Run rolling-origin backtest for a single model on a time series.
 *
 * @param model   Trained-at-each-origin model (fit() will be called repeatedly)
 * @param ts      Full preprocessed TimeSeries
 * @param horizon Max forecast horizon to evaluate
 * @returns       BacktestResult, or null if too few data points
 */
export function rollbacktest(
  model: ForecastModel,
  ts: TimeSeries,
  horizon = MAX_HORIZONS,
): BacktestResult | null {
  // Filter to non-null prices for backtesting
  const validPoints = ts.points.filter((p) => p.modal_price !== null);
  const n = validPoints.length;

  const firstOrigin = Math.max(model.minDataPoints, MIN_TRAIN_WINDOW);
  if (n <= firstOrigin + 1) return null;

  const observations: OriginResult[] = [];

  for (let origin = firstOrigin; origin < n - 1; origin++) {
    // Build a sub-series of the first `origin` points for training
    const trainTs: TimeSeries = {
      ...ts,
      points: validPoints.slice(0, origin),
      real_count: origin,
      imputed_count: 0,
    };

    const ok = model.fit(trainTs);
    if (!ok) continue;

    const forecasts = model.predict(trainTs, { horizon });
    if (!forecasts.length) continue;

    // Evaluate each horizon step
    for (let h = 1; h <= horizon; h++) {
      const testIdx = origin + h - 1;
      if (testIdx >= n) break;

      const actual = validPoints[testIdx].modal_price;
      if (actual === null) continue;

      const fp = forecasts.find((f) => f.horizon_days === h);
      if (!fp) continue;

      observations.push({
        horizon: h,
        actual,
        predicted: fp.point,
        lower: fp.lower,
        upper: fp.upper,
      });
    }
  }

  if (!observations.length) return null;

  // Aggregate by horizon
  const byHorizon = new Map<number, BacktestMetrics>();
  for (let h = 1; h <= horizon; h++) {
    const obs = observations.filter((o) => o.horizon === h);
    if (!obs.length) continue;
    byHorizon.set(
      h,
      computeMetrics(
        obs.map((o) => o.actual),
        obs.map((o) => o.predicted),
        obs.map((o) => o.lower),
        obs.map((o) => o.upper),
      )
    );
  }

  // Overall metrics (all horizons pooled)
  const overall = computeMetrics(
    observations.map((o) => o.actual),
    observations.map((o) => o.predicted),
    observations.map((o) => o.lower),
    observations.map((o) => o.upper),
  );

  // Determine the number of distinct origins used
  const origins = new Set(observations.map((o) => o.actual.toString())).size;

  return { overall, byHorizon, n_origins: origins };
}
