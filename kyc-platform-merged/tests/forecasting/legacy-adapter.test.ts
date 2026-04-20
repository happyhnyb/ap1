import { describe, expect, it } from 'vitest';
import type { ForecastResponse } from '../../lib/forecasting/schema/types';
import { toLegacyPredictorForecast } from '../../lib/forecasting/adapters/legacy';

describe('toLegacyPredictorForecast', () => {
  it('preserves the legacy predictor response contract', () => {
    const modern: ForecastResponse = {
      commodity: 'Wheat',
      commodity_id: 'wheat',
      market: 'Indore',
      mandi_id: 'indore|indore|madhya-pradesh',
      state: 'Madhya Pradesh',
      latest_price: 2450,
      latest_date: '2026-04-13',
      forecast: [
        { date: '2026-04-14', horizon_days: 1, point: 2460, lower: 2390, upper: 2525 },
        { date: '2026-04-15', horizon_days: 2, point: 2475, lower: 2405, upper: 2545 },
      ],
      direction: 'up',
      trend_pct: 1.2,
      model_used: 'adaptive_ensemble',
      insufficient: false,
      meta: {
        model_type: 'adaptive_ensemble',
        model_description: 'Adaptive Ensemble',
        data_points: 40,
        real_data_points: 35,
        has_synthetic_data: true,
        backtest: {
          mae: 110,
          rmse: 135,
          wape: 4.8,
          smape: 4.5,
          directional_accuracy: 0.71,
          ci_coverage: 0.79,
          n_test_points: 84,
        },
        disclaimer: 'Experimental price estimates only.',
      },
      explanation: {
        model_family: 'Adaptive Ensemble',
        model_id: 'adaptive_ensemble',
        top_features: [],
        parameters: {},
        recent_error_band: 4.5,
        anomaly_flags: [],
        data_summary: {
          n_real_points: 35,
          date_range: ['2026-03-01', '2026-04-13'],
          has_gaps: false,
          missing_ratio: 0.1,
        },
      },
    };

    const legacy = toLegacyPredictorForecast(modern);
    expect(legacy.meta?.model_type).toBe('holt_double_exponential_smoothing');
    expect(legacy.meta?.model_description).toBe('Adaptive Ensemble');
    expect(legacy.dataPoints).toBe(40);
    expect(legacy.realDataPoints).toBe(35);
    expect(legacy.meta?.synthetic_ratio).toBe(0.125);
    expect(legacy.forecast[0]).toEqual({
      date: '2026-04-14',
      price: 2460,
      lower: 2390,
      upper: 2525,
    });
  });
});
