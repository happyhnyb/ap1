/**
 * Data quality detection for mandi price time series.
 *
 * Operates on sorted (ascending date) arrays of modal prices.
 * Returns a DataQualityFlags array parallel to the input.
 *
 * All functions are pure and side-effect free.
 */

import type { DataQualityFlags } from '../schema/types';

const ZERO_THRESHOLD    = 0;       // price must be strictly > this
const OUTLIER_ZSCORE    = 3.0;     // |z| threshold for outlier flag
const PRICE_GAP_PCT     = 40;      // % day-over-day change → gap flag
const STALE_MIN_RUNS    = 3;       // consecutive identical prices → stale
const ROLLING_WINDOW    = 28;      // days for rolling z-score

// ── Numeric helpers ────────────────────────────────────────────────────────────

function nanMean(vals: number[]): number {
  const clean = vals.filter((v) => Number.isFinite(v));
  return clean.length ? clean.reduce((s, v) => s + v, 0) / clean.length : NaN;
}

function nanStd(vals: number[]): number {
  const clean = vals.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return NaN;
  const mu = clean.reduce((s, v) => s + v, 0) / clean.length;
  const variance = clean.reduce((s, v) => s + (v - mu) ** 2, 0) / (clean.length - 1);
  return Math.sqrt(variance);
}

function nanMedian(vals: number[]): number {
  const clean = vals.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!clean.length) return NaN;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

// ── Quality detection ──────────────────────────────────────────────────────────

/**
 * Detect zero prices.
 */
export function detectZeros(prices: (number | null)[]): boolean[] {
  return prices.map((p) => p !== null && p <= ZERO_THRESHOLD);
}

/**
 * Detect stale price runs: STALE_MIN_RUNS or more consecutive equal non-null prices.
 */
export function detectStale(prices: (number | null)[]): boolean[] {
  const result = new Array<boolean>(prices.length).fill(false);
  let runLen = 1;
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] !== null && prices[i] === prices[i - 1]) {
      runLen++;
    } else {
      runLen = 1;
    }
    if (runLen >= STALE_MIN_RUNS) {
      // Back-fill the entire run
      for (let j = i; j > i - runLen; j--) result[j] = true;
    }
  }
  return result;
}

/**
 * Detect day-over-day price gaps > PRICE_GAP_PCT%.
 */
export function detectPriceGaps(prices: (number | null)[]): boolean[] {
  const result = new Array<boolean>(prices.length).fill(false);
  let prev: number | null = null;
  for (let i = 0; i < prices.length; i++) {
    const p = prices[i];
    if (p !== null && prev !== null && prev > 0) {
      const pct = Math.abs((p - prev) / prev) * 100;
      if (pct > PRICE_GAP_PCT) result[i] = true;
    }
    if (p !== null) prev = p;
  }
  return result;
}

/**
 * Compute rolling z-scores using a backward-looking ROLLING_WINDOW window.
 * Returns NaN where the window has fewer than 7 observations.
 */
export function rollingZScores(prices: (number | null)[]): number[] {
  return prices.map((_, i) => {
    const start = Math.max(0, i - ROLLING_WINDOW);
    const window = prices.slice(start, i + 1)
      .filter((v): v is number => v !== null && Number.isFinite(v));
    if (window.length < 7) return NaN;
    const mu  = nanMean(window);
    const std = nanStd(window);
    if (!Number.isFinite(std) || std < 1e-6) return 0;
    const p = prices[i];
    if (p === null || !Number.isFinite(p)) return NaN;
    return (p - mu) / std;
  });
}

/**
 * Detect statistical outliers using rolling z-scores.
 */
export function detectOutliers(prices: (number | null)[]): { flags: boolean[]; zscores: (number | null)[] } {
  const zs = rollingZScores(prices);
  const flags  = zs.map((z) => Number.isFinite(z) && Math.abs(z) > OUTLIER_ZSCORE);
  const zscores = zs.map((z) => (Number.isFinite(z) ? z : null));
  return { flags, zscores };
}

/**
 * Build the full DataQualityFlags array for a sorted price series.
 */
export function buildQualityFlags(prices: (number | null)[]): DataQualityFlags[] {
  const zeros    = detectZeros(prices);
  const stale    = detectStale(prices);
  const gaps     = detectPriceGaps(prices);
  const { flags: outliers, zscores } = detectOutliers(prices);

  return prices.map((_, i) => ({
    is_zero:       zeros[i],
    is_stale:      stale[i],
    is_outlier:    outliers[i],
    is_imputed:    false, // set by imputer after gap-filling
    is_price_gap:  gaps[i],
    outlier_zscore: zscores[i],
  }));
}

// ── Outlier clipping ──────────────────────────────────────────────────────────

/**
 * Replace outlier values with the rolling median (conservative approach).
 * Original values are not needed after this step — quality flags preserve the metadata.
 */
export function clipOutliers(
  prices: (number | null)[],
  flags: DataQualityFlags[],
): (number | null)[] {
  const result = [...prices];
  for (let i = 0; i < result.length; i++) {
    if (!flags[i].is_outlier) continue;
    const start = Math.max(0, i - ROLLING_WINDOW);
    const window = prices
      .slice(start, i + 1)
      .filter((v): v is number => v !== null && !flags[prices.indexOf(v)]?.is_outlier);
    const med = nanMedian(window);
    result[i] = Number.isFinite(med) ? med : result[i];
  }
  return result;
}

/**
 * Compute data quality summary counts for the QualityResponse API.
 */
export function summarizeQuality(flags: DataQualityFlags[]): {
  outlier_days: number;
  stale_days:   number;
  zero_days:    number;
  imputed_days: number;
  gap_days:     number;
} {
  return flags.reduce(
    (acc, f) => ({
      outlier_days: acc.outlier_days + (f.is_outlier  ? 1 : 0),
      stale_days:   acc.stale_days   + (f.is_stale    ? 1 : 0),
      zero_days:    acc.zero_days    + (f.is_zero     ? 1 : 0),
      imputed_days: acc.imputed_days + (f.is_imputed  ? 1 : 0),
      gap_days:     acc.gap_days     + (f.is_price_gap ? 1 : 0),
    }),
    { outlier_days: 0, stale_days: 0, zero_days: 0, imputed_days: 0, gap_days: 0 }
  );
}

// Re-export constants for use in tests
export { OUTLIER_ZSCORE, STALE_MIN_RUNS, PRICE_GAP_PCT, ROLLING_WINDOW };
