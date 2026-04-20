/**
 * Tests for the preprocessing pipeline.
 *
 * Covers:
 *   - Quality flag detection (zeros, stale, outliers, price gaps)
 *   - Outlier clipping
 *   - Gap interpolation
 *   - Commodity alias normalization
 *   - MandiId construction
 */

import { describe, it, expect } from 'vitest';
import { detectZeros, detectStale, detectPriceGaps, detectOutliers, buildQualityFlags, clipOutliers } from '../../lib/forecasting/preprocessing/quality';
import { interpolateGaps } from '../../lib/forecasting/preprocessing/imputer';
import { normalizeCommodity, buildMandiId, normalizeLabel } from '../../lib/forecasting/schema/commodity';
import { DEFAULT_QUALITY } from '../../lib/forecasting/schema/types';

// ── detectZeros ───────────────────────────────────────────────────────────────

describe('detectZeros', () => {
  it('flags prices equal to 0', () => {
    expect(detectZeros([100, 0, 200, 0])).toEqual([false, true, false, true]);
  });

  it('does not flag null prices', () => {
    expect(detectZeros([null, 100])).toEqual([false, false]);
  });

  it('flags negative prices as zero (≤ 0)', () => {
    expect(detectZeros([-1, 100])).toEqual([true, false]);
  });
});

// ── detectStale ───────────────────────────────────────────────────────────────

describe('detectStale', () => {
  it('flags runs of ≥ 3 identical prices', () => {
    const prices = [100, 200, 200, 200, 300];
    const result = detectStale(prices);
    // Indices 1,2,3 are a run of 3 → all flagged
    expect(result[1]).toBe(true);
    expect(result[2]).toBe(true);
    expect(result[3]).toBe(true);
    expect(result[0]).toBe(false);
    expect(result[4]).toBe(false);
  });

  it('does not flag runs of 2', () => {
    expect(detectStale([100, 100, 200])).toEqual([false, false, false]);
  });

  it('handles null values in between', () => {
    // null breaks the run
    const result = detectStale([200, 200, null, 200]);
    expect(result.every((v) => !v)).toBe(true);
  });
});

// ── detectPriceGaps ───────────────────────────────────────────────────────────

describe('detectPriceGaps', () => {
  it('flags > 40% day-over-day change', () => {
    const prices = [100, 150, 100]; // +50%, -33%
    const result = detectPriceGaps(prices);
    expect(result[1]).toBe(true);  // +50% > 40%
    expect(result[2]).toBe(false); // 33% < 40%
  });

  it('does not flag ≤ 40% change', () => {
    expect(detectPriceGaps([100, 130, 90])).toEqual([false, false, false]);
  });

  it('skips null values', () => {
    const result = detectPriceGaps([100, null, 200]);
    expect(result[2]).toBe(true); // 100% change across the gap
  });
});

// ── detectOutliers ────────────────────────────────────────────────────────────

describe('detectOutliers', () => {
  it('flags extreme values using rolling z-score', () => {
    // Normal prices with one huge spike
    const prices: number[] = [
      100, 102, 98, 101, 103, 99, 100,
      101, 102, 99, 100, 103, 98, 101, // 14 normal days
      1000, // extreme outlier
    ];
    const { flags } = detectOutliers(prices);
    expect(flags.at(-1)).toBe(true);
    // Normal values should not be flagged
    expect(flags.slice(0, 14).every((f) => !f)).toBe(true);
  });

  it('returns null z-score when window < 7', () => {
    const { zscores } = detectOutliers([100, 200, 300]);
    expect(zscores.every((z) => z === null)).toBe(true);
  });
});

describe('clipOutliers', () => {
  it('only clips the flagged duplicate-position outlier', () => {
    const prices = [100, 100, 100, 101, 99, 100, 100, 102, 100, 100, 100, 101, 99, 100, 1000];
    const flags = buildQualityFlags(prices);
    const clipped = clipOutliers(prices, flags);

    expect(clipped.at(-1)).not.toBe(1000);
    expect(clipped[0]).toBe(100);
    expect(clipped[1]).toBe(100);
    expect(clipped[2]).toBe(100);
  });
});

// ── interpolateGaps ───────────────────────────────────────────────────────────

describe('interpolateGaps', () => {
  it('fills a single-day gap by linear interpolation', () => {
    const prices: (number | null)[] = [100, null, 200];
    const flags = [DEFAULT_QUALITY, DEFAULT_QUALITY, DEFAULT_QUALITY].map((q) => ({ ...q }));
    const result = interpolateGaps(prices, flags);
    expect(result[1]).toBeCloseTo(150, 0);
    expect(flags[1].is_imputed).toBe(true);
  });

  it('fills a 2-day gap', () => {
    const prices: (number | null)[] = [100, null, null, 400];
    const flags = prices.map(() => ({ ...DEFAULT_QUALITY }));
    const result = interpolateGaps(prices, flags);
    // Linear: t=1 → 100 + 1/3*300 = 200, t=2 → 100 + 2/3*300 = 300
    expect(result[1]).toBeCloseTo(200, 0);
    expect(result[2]).toBeCloseTo(300, 0);
  });

  it('does NOT fill gaps > 3 days', () => {
    const prices: (number | null)[] = [100, null, null, null, null, 200];
    const flags = prices.map(() => ({ ...DEFAULT_QUALITY }));
    const result = interpolateGaps(prices, flags);
    expect(result[1]).toBeNull();
    expect(result[2]).toBeNull();
    expect(result[3]).toBeNull();
    expect(result[4]).toBeNull();
  });

  it('forward-fills at the end of series', () => {
    const prices: (number | null)[] = [100, 200, null];
    const flags = prices.map(() => ({ ...DEFAULT_QUALITY }));
    const result = interpolateGaps(prices, flags);
    expect(result[2]).toBe(200);
    expect(flags[2].is_imputed).toBe(true);
  });
});

// ── normalizeCommodity ────────────────────────────────────────────────────────

describe('normalizeCommodity', () => {
  it('normalizes paddy variants', () => {
    expect(normalizeCommodity('Paddy(Common)')).toBe('paddy');
    expect(normalizeCommodity('Paddy(Hybrid)')).toBe('paddy');
    expect(normalizeCommodity('PADDY COMMON')).toBe('paddy');
  });

  it('normalizes soybean variants', () => {
    expect(normalizeCommodity('Soyabean')).toBe('soybean');
    expect(normalizeCommodity('Soya Bean')).toBe('soybean');
  });

  it('normalizes wheat', () => {
    expect(normalizeCommodity('Wheat')).toBe('wheat');
    expect(normalizeCommodity('WHEAT')).toBe('wheat');
  });

  it('returns slug for unknown commodities', () => {
    const result = normalizeCommodity('SomeUnknownCrop 2026');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── buildMandiId ──────────────────────────────────────────────────────────────

describe('buildMandiId', () => {
  it('produces a lowercase pipe-separated slug', () => {
    const id = buildMandiId('Amritsar APMC', 'Amritsar', 'Punjab');
    expect(id).toBe('amritsar|amritsar|punjab');
  });

  it('strips non-alphanumeric characters', () => {
    const id = buildMandiId('Market (North)', 'Delhi', 'Delhi');
    expect(id).toMatch(/^[a-z0-9_|]+$/);
  });

  it('is deterministic', () => {
    const a = buildMandiId('Pune', 'Pune', 'Maharashtra');
    const b = buildMandiId('Pune', 'Pune', 'Maharashtra');
    expect(a).toBe(b);
  });
});

describe('normalizeLabel', () => {
  it('normalizes market labels while ignoring APMC suffixes', () => {
    expect(normalizeLabel('Gulab Bagh APMC', { stripApmc: true })).toBe('gulab bagh');
    expect(normalizeLabel('Gulab Bagh', { stripApmc: true })).toBe('gulab bagh');
  });
});
