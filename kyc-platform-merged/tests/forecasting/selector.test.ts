import { describe, expect, it } from 'vitest';
import type { TimeSeries } from '../../lib/forecasting/schema/types';
import { DEFAULT_QUALITY } from '../../lib/forecasting/schema/types';
import { runChampionChallenger, getChampionForecast } from '../../lib/forecasting/selection/selector';

function makeSeasonalSeries(length: number): TimeSeries {
  const start = new Date('2026-01-01T00:00:00Z');
  const points = Array.from({ length }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    const seasonal = 65 * Math.sin((2 * Math.PI * index) / 7);
    const trend = index * 4;
    const price = 1900 + seasonal + trend;
    return {
      date: date.toISOString().slice(0, 10),
      commodity_id: 'soybean',
      mandi_id: 'indore|indore|madhya-pradesh',
      state: 'Madhya Pradesh',
      district: 'Indore',
      market: 'Indore',
      modal_price: price,
      min_price: price - 40,
      max_price: price + 45,
      arrivals: 120 + (index % 9) * 10,
      source: 'agmarknet' as const,
      freshness_hours: 12,
      quality: { ...DEFAULT_QUALITY },
    };
  });

  return {
    commodity_id: 'soybean',
    commodity: 'Soybean',
    mandi_id: 'indore|indore|madhya-pradesh',
    state: 'Madhya Pradesh',
    district: 'Indore',
    market: 'Indore',
    points,
    freshness: 'live',
    real_count: points.length,
    imputed_count: 0,
  };
}

describe('runChampionChallenger', () => {
  it('adds adaptive candidates when enough data exists', () => {
    const ts = makeSeasonalSeries(56);
    const result = runChampionChallenger(ts, { horizon: 7, stateAverages: new Map() });

    expect(result.models.length).toBeGreaterThan(3);
    expect(result.models.some((model) => model.modelId === 'horizon_switch')).toBe(true);

    const champion = getChampionForecast(result);
    expect(champion).not.toBeNull();
    expect(result.champion_id).not.toBe('last_value');
  });
});
