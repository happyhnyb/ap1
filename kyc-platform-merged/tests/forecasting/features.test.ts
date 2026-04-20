import { describe, expect, it } from 'vitest';
import type { TimeSeries } from '../../lib/forecasting/schema/types';
import { DEFAULT_QUALITY } from '../../lib/forecasting/schema/types';
import { FEATURE_NAMES, buildFeatureMatrix, buildInferenceVector } from '../../lib/forecasting/features/index';

function makeTimeSeries(prices: number[], startDate = '2026-01-01'): TimeSeries {
  const start = new Date(`${startDate}T00:00:00Z`);
  const points = prices.map((price, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      commodity_id: 'maize',
      mandi_id: 'gulabbagh|purnia|bihar',
      state: 'Bihar',
      district: 'Purnia',
      market: 'Gulabbagh APMC',
      modal_price: price,
      min_price: price - 50,
      max_price: price + 50,
      arrivals: 100 + index,
      source: 'agmarknet' as const,
      freshness_hours: 12,
      quality: { ...DEFAULT_QUALITY },
    };
  });

  return {
    commodity_id: 'maize',
    commodity: 'Maize',
    mandi_id: 'gulabbagh|purnia|bihar',
    state: 'Bihar',
    district: 'Purnia',
    market: 'Gulabbagh APMC',
    points,
    freshness: 'live',
    real_count: points.length,
    imputed_count: 0,
  };
}

describe('feature engineering', () => {
  it('keeps early rows unchanged when future prices change', () => {
    const basePrices = Array.from({ length: 40 }, (_, index) => 1800 + index * 5);
    const alteredPrices = [...basePrices];
    alteredPrices[25] += 500;
    alteredPrices[30] -= 350;

    const base = buildFeatureMatrix(makeTimeSeries(basePrices), { horizon: 3 });
    const altered = buildFeatureMatrix(makeTimeSeries(alteredPrices), { horizon: 3 });

    expect(base).not.toBeNull();
    expect(altered).not.toBeNull();
    expect(base?.dates[0]).toBe(altered?.dates[0]);
    expect(base?.X[0]).toEqual(altered?.X[0]);
  });

  it('builds a full inference vector matching the public feature schema', () => {
    const ts = makeTimeSeries(Array.from({ length: 35 }, (_, index) => 2000 + Math.sin(index / 2) * 40 + index * 3));
    const x = buildInferenceVector(ts, 5, '2026-02-10', 2140);
    expect(x).toHaveLength(FEATURE_NAMES.length);
    expect(x.every((value) => Number.isFinite(value) || Number.isNaN(value))).toBe(true);
  });
});
