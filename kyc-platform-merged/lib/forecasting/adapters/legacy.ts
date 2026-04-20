import type { ForecastResponse } from '../schema/types';

export function toLegacyPredictorForecast(result: ForecastResponse) {
  return {
    commodity: result.commodity,
    market: result.market,
    state: result.state,
    latestPrice: result.latest_price,
    forecast: result.forecast.map((point) => ({
      date: point.date,
      price: point.point,
      lower: point.lower,
      upper: point.upper,
    })),
    direction: result.direction,
    trend_pct: result.trend_pct,
    dataPoints: result.meta.data_points,
    realDataPoints: result.meta.real_data_points,
    insufficient: result.insufficient,
    message: result.message,
    meta: {
      model_type: 'holt_double_exponential_smoothing' as const,
      model_description: result.meta.model_description,
      alpha: 0,
      beta: 0,
      mape: result.meta.backtest.smape ?? result.meta.backtest.wape ?? 0,
      mae: result.meta.backtest.mae,
      rmse: result.meta.backtest.rmse,
      smape: result.meta.backtest.smape,
      data_points: result.meta.data_points,
      real_data_points: result.meta.real_data_points,
      synthetic_ratio: result.meta.data_points > 0
        ? Math.max(0, (result.meta.data_points - result.meta.real_data_points) / result.meta.data_points)
        : 0,
      has_synthetic_data: result.meta.has_synthetic_data,
      disclaimer: result.meta.disclaimer,
    },
    insights: null,
  };
}
