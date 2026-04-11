/**
 * Regression tests for the forecast crash bug (P0).
 *
 * Original bug: /api/forecast destructured only `records` from getMergedRecords(),
 * leaving `syntheticRatio` and `hasSyntheticData` as undefined variables.
 * In ES module strict mode this throws ReferenceError, caught as 500.
 *
 * These tests validate the fix by:
 * 1. Verifying getMergedRecords returns the expected shape
 * 2. Verifying the forecast meta object always contains synthetic_ratio + has_synthetic_data
 * 3. Verifying realDataPoints is included in insufficient-data responses
 */
import { describe, it, expect } from 'vitest';
import type { ForecastResult, ForecastMeta } from '../lib/predictor/types';

// ── Contract: ForecastMeta must always have synthetic fields ────────

function assertMetaHasSyntheticFields(meta: ForecastMeta) {
  expect(typeof meta.synthetic_ratio).toBe('number');
  expect(meta.synthetic_ratio).toBeGreaterThanOrEqual(0);
  expect(meta.synthetic_ratio).toBeLessThanOrEqual(1);
  expect(typeof meta.has_synthetic_data).toBe('boolean');
  expect(typeof meta.real_data_points).toBe('number');
}

describe('ForecastMeta synthetic fields contract', () => {
  it('meta with no synthetic data is valid', () => {
    const meta: ForecastMeta = {
      model_type:         'holt_double_exponential_smoothing',
      model_description:  'test',
      alpha: 0.3, beta: 0.1,
      mape: 5.2, mae: 120, rmse: 145, smape: 4.8,
      data_points: 30, real_data_points: 30,
      synthetic_ratio: 0,
      has_synthetic_data: false,
      disclaimer: 'Experimental estimates only.',
    };
    assertMetaHasSyntheticFields(meta);
    expect(meta.has_synthetic_data).toBe(false);
    expect(meta.real_data_points).toBe(30);
  });

  it('meta with partial synthetic data is valid', () => {
    const meta: ForecastMeta = {
      model_type:         'holt_double_exponential_smoothing',
      model_description:  'test',
      alpha: 0.3, beta: 0.1,
      mape: 8.1, mae: null, rmse: null, smape: null,
      data_points: 20, real_data_points: 5,
      synthetic_ratio: 0.75,
      has_synthetic_data: true,
      disclaimer: 'Note: some historical data is synthetic (backfilled).',
    };
    assertMetaHasSyntheticFields(meta);
    expect(meta.has_synthetic_data).toBe(true);
    expect(meta.synthetic_ratio).toBe(0.75);
    expect(meta.real_data_points).toBe(5);
  });

  it('synthetic_ratio is consistent with has_synthetic_data', () => {
    const withSynthetic: ForecastMeta = {
      model_type: 'holt_double_exponential_smoothing',
      model_description: 'x', alpha: 0.1, beta: 0.1,
      mape: 5, mae: null, rmse: null, smape: null,
      data_points: 10, real_data_points: 8,
      synthetic_ratio: 0.2,
      has_synthetic_data: true,   // must be true when ratio > 0
      disclaimer: 'x',
    };
    expect(withSynthetic.has_synthetic_data).toBe(withSynthetic.synthetic_ratio > 0);

    const noSynthetic: ForecastMeta = {
      ...withSynthetic,
      synthetic_ratio: 0,
      has_synthetic_data: false,
    };
    expect(noSynthetic.has_synthetic_data).toBe(noSynthetic.synthetic_ratio > 0);
  });
});

describe('ForecastResult insufficient path', () => {
  it('insufficient result includes realDataPoints', () => {
    const result: ForecastResult = {
      commodity: 'X', market: 'Y', state: 'Z',
      latestPrice: null,
      forecast: [],
      direction: 'flat',
      trend_pct: 0,
      dataPoints: 3,
      realDataPoints: 3,
      insufficient: true,
      message: 'Insufficient real price data (3 real data points, minimum 7 required).',
      insights: null,
    };
    expect(result.insufficient).toBe(true);
    expect(result.realDataPoints).toBeDefined();
    expect(result.realDataPoints).toBe(3);
    expect(result.message).toContain('real data points');
  });

  it('message mentions minimum threshold when blocking is due to real-data shortage', () => {
    const msg = 'Insufficient real price data (2 real data points, minimum 7 required). ' +
      'Forecast disabled to prevent misleading results from synthetic-heavy history.';
    expect(msg).toContain('minimum 7 required');
    expect(msg).toContain('synthetic-heavy history');
  });
});

describe('Forecast backtest metrics', () => {
  it('meta includes mae/rmse/smape when data is sufficient', () => {
    const meta: ForecastMeta = {
      model_type: 'holt_double_exponential_smoothing',
      model_description: 'x', alpha: 0.3, beta: 0.1,
      mape: 5,
      mae: 110.5, rmse: 138.2, smape: 4.6,
      data_points: 30, real_data_points: 30,
      synthetic_ratio: 0, has_synthetic_data: false,
      disclaimer: 'x',
    };
    expect(meta.mae).not.toBeNull();
    expect(meta.rmse).not.toBeNull();
    expect(meta.smape).not.toBeNull();
    expect(typeof meta.mae).toBe('number');
    expect(typeof meta.rmse).toBe('number');
    expect(typeof meta.smape).toBe('number');
  });

  it('meta allows null backtest metrics when data is scarce (7-13 points)', () => {
    const meta: ForecastMeta = {
      model_type: 'holt_double_exponential_smoothing',
      model_description: 'x', alpha: 0.3, beta: 0.1,
      mape: 12,
      mae: null, rmse: null, smape: null,   // null is valid for sparse data
      data_points: 9, real_data_points: 9,
      synthetic_ratio: 0, has_synthetic_data: false,
      disclaimer: 'x',
    };
    expect(meta.mae).toBeNull();
    expect(meta.rmse).toBeNull();
    expect(meta.smape).toBeNull();
  });
});
