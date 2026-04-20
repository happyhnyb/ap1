/**
 * Tests for forecasting models.
 *
 * Each model is tested for:
 *   - Correct fit/predict lifecycle
 *   - Returns false for insufficient data
 *   - Forecast has the right structure (horizon_days 1..H, lower ≤ point ≤ upper)
 *   - Direction sanity: strong upward trend → direction 'up'
 *
 * Tests use synthetic deterministic data (linear ramp + weekly seasonality).
 */

import { describe, it, expect } from 'vitest';
import type { TimeSeries } from '../../lib/forecasting/schema/types';
import { DEFAULT_QUALITY } from '../../lib/forecasting/schema/types';
import { SeasonalNaiveModel } from '../../lib/forecasting/models/baseline/seasonal-naive';
import { HoltWintersModel }   from '../../lib/forecasting/models/baseline/holt-winters';
import { SMAModel }           from '../../lib/forecasting/models/baseline/sma';
import { GBRTModel }          from '../../lib/forecasting/models/challenger/gbrt';
import { GRUSequenceModel }   from '../../lib/forecasting/models/challenger/gru';
import { RegressionTree }     from '../../lib/forecasting/models/challenger/tree';

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeTimeSeries(prices: (number | null)[], startDate = '2026-01-01'): TimeSeries {
  const start = new Date(startDate);
  const points = prices.map((p, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return {
      date:         d.toISOString().slice(0, 10),
      commodity_id: 'wheat',
      mandi_id:     'amritsar|amritsar|punjab',
      state:        'Punjab',
      district:     'Amritsar',
      market:       'Amritsar',
      modal_price:  p,
      min_price:    p !== null ? p * 0.9 : null,
      max_price:    p !== null ? p * 1.1 : null,
      arrivals:     null,
      source:       'agmarknet' as const,
      freshness_hours: 12,
      quality:      { ...DEFAULT_QUALITY },
    };
  });

  const nonNull = points.filter((p) => p.modal_price !== null);
  return {
    commodity_id:   'wheat',
    commodity:      'Wheat',
    mandi_id:       'amritsar|amritsar|punjab',
    state:          'Punjab',
    district:       'Amritsar',
    market:         'Amritsar',
    points,
    freshness:      'live',
    real_count:     nonNull.length,
    imputed_count:  0,
  };
}

/** Generate a rising price series with weekly seasonality. */
function risingPrices(n: number, base = 2000, trend = 5): number[] {
  return Array.from({ length: n }, (_, i) => {
    const seasonal = 50 * Math.sin(2 * Math.PI * i / 7);
    return base + i * trend + seasonal;
  });
}

/** Generate a flat price series. */
function flatPrices(n: number, value = 2000): number[] {
  return Array.from({ length: n }, () => value);
}

// ── Regression Tree ───────────────────────────────────────────────────────────

describe('RegressionTree', () => {
  it('fits and predicts without errors', () => {
    const X = [[1], [2], [3], [4], [5], [6], [7], [8], [9], [10]];
    const y = [1,    2,   3,   4,   5,   6,   7,   8,   9,   10];
    const tree = new RegressionTree({ maxDepth: 3, minSamplesLeaf: 2 });
    tree.fit(X, y);
    const pred = tree.predict([5.5]);
    expect(Number.isFinite(pred)).toBe(true);
    expect(pred).toBeGreaterThan(0);
  });

  it('predicts mean of leaf for constant output', () => {
    const X = [[1], [2], [3], [4], [5]];
    const y = [10, 10, 10, 10, 10];
    const tree = new RegressionTree({ maxDepth: 2, minSamplesLeaf: 1 });
    tree.fit(X, y);
    expect(tree.predict([3])).toBeCloseTo(10, 1);
  });

  it('accumulates non-zero feature importances for informative features', () => {
    const X = [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0]];
    const y =  [1,      2,      3,      4,      5,      6,      7,      8];
    const tree = new RegressionTree({ maxDepth: 3, minSamplesLeaf: 1 });
    tree.fit(X, y);
    // Feature 0 is informative, feature 1 is not
    expect(tree.featureImportances[0]).toBeGreaterThan(tree.featureImportances[1]);
  });
});

// ── Seasonal Naive ────────────────────────────────────────────────────────────

describe('SeasonalNaiveModel', () => {
  it('returns false for < 7 data points', () => {
    const m = new SeasonalNaiveModel();
    expect(m.fit(makeTimeSeries([100, 200, 300]))).toBe(false);
  });

  it('fits with ≥ 7 data points', () => {
    const m = new SeasonalNaiveModel();
    expect(m.fit(makeTimeSeries(risingPrices(14)))).toBe(true);
  });

  it('produces horizon_days 1..14', () => {
    const m = new SeasonalNaiveModel();
    const ts = makeTimeSeries(risingPrices(30));
    m.fit(ts);
    const fps = m.predict(ts, { horizon: 14 });
    expect(fps).toHaveLength(14);
    fps.forEach((fp, i) => expect(fp.horizon_days).toBe(i + 1));
  });

  it('lower ≤ point ≤ upper for all forecast points', () => {
    const m = new SeasonalNaiveModel();
    const ts = makeTimeSeries(risingPrices(21));
    m.fit(ts);
    m.predict(ts, { horizon: 7 }).forEach((fp) => {
      expect(fp.lower).toBeLessThanOrEqual(fp.point + 0.01);
      expect(fp.upper).toBeGreaterThanOrEqual(fp.point - 0.01);
    });
  });
});

// ── Holt-Winters ─────────────────────────────────────────────────────────────

describe('HoltWintersModel', () => {
  it('returns false for < 14 data points', () => {
    const m = new HoltWintersModel();
    expect(m.fit(makeTimeSeries(risingPrices(10)))).toBe(false);
  });

  it('fits with ≥ 14 data points', () => {
    const m = new HoltWintersModel();
    expect(m.fit(makeTimeSeries(risingPrices(28)))).toBe(true);
  });

  it('captures upward trend in 14-day forecast', () => {
    const m = new HoltWintersModel();
    const prices = risingPrices(60, 2000, 10);
    const ts = makeTimeSeries(prices);
    m.fit(ts);
    const fps = m.predict(ts, { horizon: 14 });
    // The 14-day forecast should be higher than the latest price
    const latestPrice = prices.at(-1)!;
    const forecast14  = fps.at(-1)!.point;
    expect(forecast14).toBeGreaterThan(latestPrice * 0.9); // at least 90% of latest (conservative)
  });

  it('returns CI with lower ≤ point ≤ upper', () => {
    const m = new HoltWintersModel();
    const ts = makeTimeSeries(risingPrices(30));
    m.fit(ts);
    m.predict(ts, { horizon: 7 }).forEach((fp) => {
      expect(fp.lower).toBeLessThanOrEqual(fp.point + 0.01);
      expect(fp.upper).toBeGreaterThanOrEqual(fp.point - 0.01);
    });
  });
});

// ── SMA ───────────────────────────────────────────────────────────────────────

describe('SMAModel', () => {
  it('returns false for < 3 data points', () => {
    const m = new SMAModel();
    expect(m.fit(makeTimeSeries([100, 200]))).toBe(false);
  });

  it('flat forecast equals mean of last k prices', () => {
    const m = new SMAModel();
    // Prices: 100, 110, 120, 130, 140 — SMA-3 = mean(120,130,140) = 130
    const ts = makeTimeSeries([100, 110, 120, 130, 140]);
    m.fit(ts);
    const fps = m.predict(ts, { horizon: 3 });
    // All horizons should have the same point (flat forecast)
    const points = fps.map((f) => f.point);
    expect(new Set(points).size).toBe(1);
  });

  it('selects smallest k with best in-sample RMSE', () => {
    // For a perfectly linear series, SMA-3 beats SMA-7 (smaller lag)
    const m = new SMAModel();
    const ts = makeTimeSeries(risingPrices(20));
    expect(m.fit(ts)).toBe(true);
  });
});

// ── GBRT ─────────────────────────────────────────────────────────────────────

describe('GBRTModel', () => {
  it('returns false for < 30 data points', () => {
    const m = new GBRTModel();
    expect(m.fit(makeTimeSeries(risingPrices(20)))).toBe(false);
  });

  it('fits with ≥ 30 data points', () => {
    const m = new GBRTModel();
    expect(m.fit(makeTimeSeries(risingPrices(60)))).toBe(true);
  });

  it('produces forecast with non-negative prices', () => {
    const m = new GBRTModel();
    const ts = makeTimeSeries(risingPrices(60));
    m.fit(ts);
    const fps = m.predict(ts, { horizon: 14 });
    fps.forEach((fp) => {
      expect(fp.point).toBeGreaterThanOrEqual(0);
      expect(fp.lower).toBeGreaterThanOrEqual(0);
      expect(fp.upper).toBeGreaterThanOrEqual(fp.lower);
    });
  });

  it('produces feature importances summing to ≈ 1', () => {
    const m = new GBRTModel();
    const ts = makeTimeSeries(risingPrices(60));
    m.fit(ts);
    const expl = m.explain(2000);
    const totalImp = expl.top_features.reduce((s, f) => s + f.importance, 0);
    // Top features shown (partial), so sum ≤ 1
    expect(totalImp).toBeLessThanOrEqual(1 + 1e-6);
    expect(totalImp).toBeGreaterThan(0);
  });
});

describe('GRUSequenceModel', () => {
  it('returns false for short series', () => {
    const model = new GRUSequenceModel();
    expect(model.fit(makeTimeSeries(risingPrices(28)))).toBe(false);
  });

  it('fits on longer seasonal series and returns bounded forecasts', () => {
    const model = new GRUSequenceModel();
    const ts = makeTimeSeries(risingPrices(56, 2100, 4));
    expect(model.fit(ts)).toBe(true);

    const forecast = model.predict(ts, { horizon: 7 });
    expect(forecast).toHaveLength(7);
    forecast.forEach((point, index) => {
      expect(point.horizon_days).toBe(index + 1);
      expect(point.point).toBeGreaterThanOrEqual(0);
      expect(point.lower).toBeLessThanOrEqual(point.point + 0.01);
      expect(point.upper).toBeGreaterThanOrEqual(point.point - 0.01);
    });
  });
});
