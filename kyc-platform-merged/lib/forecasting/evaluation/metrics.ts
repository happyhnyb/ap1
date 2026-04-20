/**
 * Forecasting evaluation metrics.
 *
 * All functions accept parallel arrays of actuals and predictions.
 * NaN-safe: pairs where either value is NaN/null are silently excluded.
 *
 * Metrics:
 *   MAE   — Mean Absolute Error (same unit as price)
 *   WAPE  — Weighted Absolute Percentage Error (%)
 *   sMAPE — Symmetric Mean Absolute Percentage Error (%)
 *   DIR   — Directional Accuracy (fraction of correct direction calls)
 *   CIC   — Confidence Interval Coverage (fraction inside [lower, upper])
 */

import type { BacktestMetrics } from '../schema/types';

// ── Validation helpers ─────────────────────────────────────────────────────────

function validPairs(actual: number[], predicted: number[]): { a: number; p: number }[] {
  return actual
    .map((a, i) => ({ a, p: predicted[i] }))
    .filter(({ a, p }) => Number.isFinite(a) && Number.isFinite(p));
}

// ── Individual metrics ─────────────────────────────────────────────────────────

/**
 * Mean Absolute Error.
 * @returns ₹/quintal, or null if no valid pairs.
 */
export function mae(actual: number[], predicted: number[]): number | null {
  const pairs = validPairs(actual, predicted);
  if (!pairs.length) return null;
  return pairs.reduce((s, { a, p }) => s + Math.abs(a - p), 0) / pairs.length;
}

export function rmse(actual: number[], predicted: number[]): number | null {
  const pairs = validPairs(actual, predicted);
  if (!pairs.length) return null;
  const mse = pairs.reduce((sum, { a, p }) => sum + (a - p) ** 2, 0) / pairs.length;
  return Math.sqrt(mse);
}

/**
 * Weighted Absolute Percentage Error.
 * WAPE = Σ|y − ŷ| / Σy × 100
 * More robust than MAPE to near-zero actuals; robust to scale.
 * @returns %, or null if sumActual === 0.
 */
export function wape(actual: number[], predicted: number[]): number | null {
  const pairs = validPairs(actual, predicted);
  if (!pairs.length) return null;
  const sumErr    = pairs.reduce((s, { a, p }) => s + Math.abs(a - p), 0);
  const sumActual = pairs.reduce((s, { a }) => s + Math.abs(a), 0);
  if (sumActual < 1e-6) return null;
  return (sumErr / sumActual) * 100;
}

/**
 * Symmetric Mean Absolute Percentage Error.
 * sMAPE = mean(2|y − ŷ| / (|y| + |ŷ|)) × 100
 * Bounded [0, 200%]. Undefined when both y and ŷ are 0 (excluded).
 * @returns %, or null if no valid pairs.
 */
export function smape(actual: number[], predicted: number[]): number | null {
  const pairs = validPairs(actual, predicted);
  const valid = pairs.filter(({ a, p }) => Math.abs(a) + Math.abs(p) > 1e-6);
  if (!valid.length) return null;
  const s = valid.reduce((acc, { a, p }) => acc + 2 * Math.abs(a - p) / (Math.abs(a) + Math.abs(p)), 0);
  return (s / valid.length) * 100;
}

/**
 * Directional Accuracy.
 * Fraction of timesteps where sign(Δactual) === sign(Δpredicted).
 * Requires at least 2 consecutive pairs.
 * @returns 0–1, or null.
 */
export function directionalAccuracy(actual: number[], predicted: number[]): number | null {
  const n = Math.min(actual.length, predicted.length);
  if (n < 2) return null;
  let correct = 0, total = 0;
  for (let i = 1; i < n; i++) {
    if (!Number.isFinite(actual[i]) || !Number.isFinite(actual[i - 1])) continue;
    if (!Number.isFinite(predicted[i]) || !Number.isFinite(predicted[i - 1])) continue;
    const da = actual[i] - actual[i - 1];
    const dp = predicted[i] - predicted[i - 1];
    // Flat vs. flat counts as correct
    if (Math.sign(da) === Math.sign(dp) || (da === 0 && dp === 0)) correct++;
    total++;
  }
  return total ? correct / total : null;
}

/**
 * Confidence Interval Coverage.
 * Fraction of actual values that fall within [lower, upper].
 * Target: ~0.80 for an 80% CI.
 *
 * @param actual   Actual price values
 * @param lower    Lower bound of forecast CI
 * @param upper    Upper bound of forecast CI
 * @returns 0–1, or null if no valid triplets.
 */
export function ciCoverage(
  actual: number[],
  lower:  number[],
  upper:  number[],
): number | null {
  const n = Math.min(actual.length, lower.length, upper.length);
  let inside = 0, total = 0;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(actual[i]) || !Number.isFinite(lower[i]) || !Number.isFinite(upper[i])) continue;
    if (actual[i] >= lower[i] && actual[i] <= upper[i]) inside++;
    total++;
  }
  return total ? inside / total : null;
}

// ── Aggregate metrics object ───────────────────────────────────────────────────

/**
 * Compute all metrics and return a BacktestMetrics object.
 *
 * @param actual     Observed prices
 * @param predicted  Point forecasts
 * @param lower      Lower CI bounds (optional — set ciCoverage = null if absent)
 * @param upper      Upper CI bounds (optional)
 */
export function computeMetrics(
  actual: number[],
  predicted: number[],
  lower?: number[],
  upper?: number[],
): BacktestMetrics {
  const n = validPairs(actual, predicted).length;

  const coverage = lower && upper ? ciCoverage(actual, lower, upper) : null;

  return {
    mae:                  roundN(mae(actual, predicted)),
    rmse:                 roundN(rmse(actual, predicted)),
    wape:                 roundN(wape(actual, predicted)),
    smape:                roundN(smape(actual, predicted)),
    directional_accuracy: roundN4(directionalAccuracy(actual, predicted)),
    ci_coverage:          roundN4(coverage),
    n_test_points:        n,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function roundN(v: number | null, decimals = 2): number | null {
  if (v === null) return null;
  const factor = 10 ** decimals;
  return Math.round(v * factor) / factor;
}

function roundN4(v: number | null): number | null {
  return roundN(v, 4);
}

/**
 * Pick the "better" of two BacktestMetrics by sMAPE (lower is better).
 * Falls back to WAPE if sMAPE is null.
 */
export function isBetter(a: BacktestMetrics, b: BacktestMetrics): boolean {
  const sMapeA = a.smape ?? a.wape ?? Infinity;
  const sMapeB = b.smape ?? b.wape ?? Infinity;
  return sMapeA < sMapeB;
}
