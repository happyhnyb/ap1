/**
 * Missing value imputation for mandi price time series.
 *
 * Strategy:
 *   - Gaps of 1–3 consecutive null days → linear interpolation between
 *     the last known value before and the first known value after.
 *   - Gaps > 3 consecutive days → leave as null (structural absence —
 *     the mandi may have been closed or not reporting).
 *
 * Imputed values are flagged with is_imputed = true in DataQualityFlags.
 */

import type { DataQualityFlags } from '../schema/types';

const MAX_INTERP_GAP = 3; // days

/**
 * Fill short gaps (≤ MAX_INTERP_GAP) via linear interpolation.
 *
 * @param prices  Sorted (ascending date) array of nullable prices.
 * @param flags   Parallel DataQualityFlags array — modified in place to set is_imputed.
 * @returns       New price array with gaps filled where feasible.
 */
export function interpolateGaps(
  prices: (number | null)[],
  flags: DataQualityFlags[],
): (number | null)[] {
  const result: (number | null)[] = [...prices];
  const n = prices.length;
  let i = 0;

  while (i < n) {
    if (result[i] !== null) { i++; continue; }

    // Find the extent of this null run
    let gapStart = i;
    while (i < n && result[i] === null) i++;
    const gapEnd = i; // exclusive

    const gapLen = gapEnd - gapStart;
    if (gapLen > MAX_INTERP_GAP) continue; // leave long gaps as-is

    // Find anchor values
    const before = gapStart > 0 ? result[gapStart - 1] : null;
    const after  = gapEnd < n   ? result[gapEnd]        : null;

    if (before === null && after === null) continue; // no anchors

    // Linear interpolation (or flat fill if only one anchor)
    for (let j = gapStart; j < gapEnd; j++) {
      let filled: number;
      if (before !== null && after !== null) {
        const t = (j - gapStart + 1) / (gapLen + 1);
        filled = before + t * (after - before);
      } else if (before !== null) {
        filled = before; // forward-fill
      } else {
        filled = after!; // backward-fill
      }
      result[j] = Math.round(filled * 100) / 100; // round to 2 decimal places
      flags[j] = { ...flags[j], is_imputed: true };
    }
  }

  return result;
}

/**
 * Forward-fill the last valid value for a single missing point.
 * Used when we have a single daily gap and no future anchor.
 */
export function forwardFill(prices: (number | null)[]): (number | null)[] {
  const result = [...prices];
  let last: number | null = null;
  for (let i = 0; i < result.length; i++) {
    if (result[i] !== null) {
      last = result[i];
    } else if (last !== null) {
      result[i] = last;
    }
  }
  return result;
}

/**
 * Count the number of null values in a price series.
 */
export function countMissing(prices: (number | null)[]): number {
  return prices.filter((p) => p === null).length;
}

/**
 * Return indices of all null positions.
 */
export function missingIndices(prices: (number | null)[]): number[] {
  return prices.map((p, i) => (p === null ? i : -1)).filter((i) => i >= 0);
}
