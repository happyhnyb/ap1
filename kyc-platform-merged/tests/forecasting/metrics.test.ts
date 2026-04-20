/**
 * Tests for evaluation metrics.
 *
 * Each metric is tested for:
 *   - Correct formula on simple examples
 *   - Null handling when no valid pairs
 *   - Edge cases (zero actuals, perfect forecast, etc.)
 */

import { describe, it, expect } from 'vitest';
import { mae, wape, smape, directionalAccuracy, ciCoverage, computeMetrics, isBetter } from '../../lib/forecasting/evaluation/metrics';

describe('MAE', () => {
  it('computes mean absolute error correctly', () => {
    const actual    = [100, 200, 300];
    const predicted = [110, 190, 320];
    // |100-110| + |200-190| + |300-320| = 10 + 10 + 20 = 40 / 3 ≈ 13.33
    expect(mae(actual, predicted)).toBeCloseTo(13.33, 1);
  });

  it('returns null for empty arrays', () => {
    expect(mae([], [])).toBeNull();
  });

  it('returns 0 for perfect forecast', () => {
    expect(mae([100, 200], [100, 200])).toBe(0);
  });

  it('filters NaN pairs', () => {
    expect(mae([100, NaN, 300], [110, 200, 310])).toBeCloseTo(10, 1);
  });
});

describe('WAPE', () => {
  it('computes weighted absolute percentage error', () => {
    // |10| + |10| + |20| = 40; sum actual = 600; WAPE = 40/600*100 = 6.67%
    expect(wape([100, 200, 300], [110, 190, 320])).toBeCloseTo(6.67, 1);
  });

  it('returns null for zero actuals', () => {
    expect(wape([0, 0], [1, 1])).toBeNull();
  });

  it('returns 0 for perfect forecast', () => {
    expect(wape([100, 200], [100, 200])).toBe(0);
  });
});

describe('sMAPE', () => {
  it('is symmetric', () => {
    const a = [100, 200];
    const b = [150, 250];
    // sMAPE should be the same regardless of which is actual/predicted
    const s1 = smape(a, b);
    const s2 = smape(b, a);
    expect(Math.abs((s1 ?? 0) - (s2 ?? 0))).toBeLessThan(0.01);
  });

  it('returns 0 for perfect forecast', () => {
    expect(smape([100, 200], [100, 200])).toBe(0);
  });

  it('is bounded [0, 200]', () => {
    const v = smape([100], [0]);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v!).toBeLessThanOrEqual(200);
  });

  it('returns null when both are zero', () => {
    // zero pair is excluded; if all are zero pairs → null
    expect(smape([0], [0])).toBeNull();
  });
});

describe('Directional Accuracy', () => {
  it('perfect directional accuracy', () => {
    // All go up
    expect(directionalAccuracy([100, 110, 120, 130], [100, 105, 115, 125])).toBe(1);
  });

  it('zero directional accuracy (all wrong)', () => {
    expect(directionalAccuracy([100, 90, 80], [100, 110, 120])).toBe(0);
  });

  it('returns null for single point', () => {
    expect(directionalAccuracy([100], [100])).toBeNull();
  });

  it('counts flat → flat as correct', () => {
    expect(directionalAccuracy([100, 100], [100, 100])).toBe(1);
  });
});

describe('CI Coverage', () => {
  it('all inside the interval', () => {
    const actual = [100, 200, 300];
    const lower  = [90,  180, 280];
    const upper  = [110, 220, 320];
    expect(ciCoverage(actual, lower, upper)).toBe(1);
  });

  it('none inside the interval', () => {
    const actual = [50,  50];
    const lower  = [100, 100];
    const upper  = [200, 200];
    expect(ciCoverage(actual, lower, upper)).toBe(0);
  });

  it('partial coverage', () => {
    // 2 out of 4 inside
    expect(ciCoverage(
      [100, 200, 300, 400],
      [90,  250, 280, 450],   // 100∈[90,110]✓, 200∈[250,260]✗, 300∈[280,320]✓, 400∈[450,500]✗
      [110, 260, 320, 500],
    )).toBe(0.5);
  });
});

describe('computeMetrics', () => {
  it('produces all metrics for valid input', () => {
    const actual    = [100, 110, 120, 130, 140];
    const predicted = [102, 108, 122, 128, 142];
    const lower     = [95,  100, 115, 122, 135];
    const upper     = [110, 118, 130, 136, 150];

    const m = computeMetrics(actual, predicted, lower, upper);

    expect(m.mae).not.toBeNull();
    expect(m.wape).not.toBeNull();
    expect(m.smape).not.toBeNull();
    expect(m.directional_accuracy).not.toBeNull();
    expect(m.ci_coverage).not.toBeNull();
    expect(m.n_test_points).toBe(5);
  });
});

describe('isBetter', () => {
  it('prefers lower sMAPE', () => {
    const a = { mae: 10, rmse: 11, wape: 5, smape: 3,  directional_accuracy: 0.8, ci_coverage: 0.8, n_test_points: 10 };
    const b = { mae: 10, rmse: 11, wape: 5, smape: 5,  directional_accuracy: 0.8, ci_coverage: 0.8, n_test_points: 10 };
    expect(isBetter(a, b)).toBe(true);
    expect(isBetter(b, a)).toBe(false);
  });

  it('falls back to WAPE when sMAPE is null', () => {
    const a = { mae: null, rmse: null, wape: 3,  smape: null, directional_accuracy: null, ci_coverage: null, n_test_points: 0 };
    const b = { mae: null, rmse: null, wape: 10, smape: null, directional_accuracy: null, ci_coverage: null, n_test_points: 0 };
    expect(isBetter(a, b)).toBe(true);
  });
});
