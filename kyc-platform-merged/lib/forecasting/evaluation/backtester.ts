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
const MAX_BACKTEST_ORIGINS = 14;

export interface BacktestResult {
  /** Metrics aggregated across all origins and all horizons. */
  overall: BacktestMetrics;
  /** Metrics per horizon step (key = horizon day). */
  byHorizon: Map<number, BacktestMetrics>;
  /** Raw observations per horizon for adaptive model selection / ensembles. */
  observationsByHorizon: Map<number, HorizonObservation[]>;
  /** Number of valid origins used. */
  n_origins: number;
}

interface OriginResult {
  origin: number;
  horizon: number;
  actual:    number;
  predicted: number;
  lower:     number;
  upper:     number;
}

export interface HorizonObservation {
  origin: number;
  actual: number;
  predicted: number;
  lower: number;
  upper: number;
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
  const evaluatedOrigins = new Set<number>();
  const candidateOrigins = Array.from({ length: Math.max(0, n - 1 - firstOrigin) }, (_, index) => firstOrigin + index);
  const origins = candidateOrigins.length > MAX_BACKTEST_ORIGINS
    ? candidateOrigins.slice(-MAX_BACKTEST_ORIGINS)
    : candidateOrigins;

  for (const origin of origins) {
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

      evaluatedOrigins.add(origin);
      observations.push({
        origin,
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
  const observationsByHorizon = new Map<number, HorizonObservation[]>();
  for (let h = 1; h <= horizon; h++) {
    const obs = observations.filter((o) => o.horizon === h);
    if (!obs.length) continue;
    observationsByHorizon.set(h, obs.map((item) => ({
      origin: item.origin,
      actual: item.actual,
      predicted: item.predicted,
      lower: item.lower,
      upper: item.upper,
    })));
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

  const directionalParts = [...byHorizon.values()]
    .filter((metrics) => metrics.directional_accuracy !== null && metrics.n_test_points > 0);
  overall.directional_accuracy = directionalParts.length
    ? directionalParts.reduce((sum, metrics) => sum + (metrics.directional_accuracy ?? 0) * metrics.n_test_points, 0)
      / directionalParts.reduce((sum, metrics) => sum + metrics.n_test_points, 0)
    : null;

  return {
    overall,
    byHorizon,
    observationsByHorizon,
    n_origins: evaluatedOrigins.size,
  };
}
