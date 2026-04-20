/**
 * Seasonal Naive baseline model.
 *
 * Forecast: ŷ_{t+h} = y_{t + ((h−1) mod L) − L}  where L = 7 (weekly seasonality).
 *
 * In practice: "the price h days from now will be the same as the price
 * that was observed on the same day of the week closest in the past."
 *
 * Interval: ±1.28 × std(in-sample seasonal residuals) → approximately 80% CI.
 *
 * Requires: ≥ L = 7 data points.
 */

import type { TimeSeries, ForecastPoint, ModelExplanation } from '../../schema/types';
import type { ForecastModel, PredictOptions } from '../interface';
import {
  getObservedPoints,
  intervalHalfWidth,
  forecastDatesFromSeries,
  boundedForecastPoint,
} from '../utils';

const PERIOD = 7; // weekly seasonality

export class SeasonalNaiveModel implements ForecastModel {
  readonly id = 'seasonal_naive';
  readonly name = 'Seasonal Naive (weekly)';
  readonly family = 'Seasonal Naive';
  readonly minDataPoints = PERIOD;

  private fitted = false;
  private prices: number[] = [];
  private dates:  string[] = [];
  private residualScale = 0;

  fit(ts: TimeSeries): boolean {
    const valid = getObservedPoints(ts);

    if (valid.length < this.minDataPoints) {
      this.fitted = false;
      return false;
    }

    this.prices = valid.map((p) => p.price);
    this.dates  = valid.map((p) => p.date);

    // Compute in-sample residuals: actual − seasonal-naive prediction
    const residuals: number[] = [];
    for (let t = PERIOD; t < this.prices.length; t++) {
      const pred = this.prices[t - PERIOD];
      residuals.push(this.prices[t] - pred);
    }

    const n = residuals.length;
    if (n >= 2) {
      const mean = residuals.reduce((s, v) => s + v, 0) / n;
      const variance = residuals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
      this.residualScale = Math.sqrt(variance);
    } else {
      this.residualScale = 0;
    }

    this.fitted = true;
    return true;
  }

  predict(ts: TimeSeries, opts: PredictOptions): ForecastPoint[] {
    if (!this.fitted) return [];
    const { horizon } = opts;
    const n = this.prices.length;
    const futureDates = forecastDatesFromSeries(ts, horizon);
    const results: ForecastPoint[] = [];

    for (let h = 1; h <= horizon; h++) {
      // Look back L days, wrapping within the available history
      const sourceIdx = n - PERIOD + ((h - 1) % PERIOD);
      const clampedIdx = Math.max(0, Math.min(n - 1, sourceIdx));
      const point = this.prices[clampedIdx];
      const date = futureDates[h - 1];
      const halfWidth = intervalHalfWidth(this.residualScale, this.prices, h, ts, 1.2);
      results.push(boundedForecastPoint(point, halfWidth, date, h));
    }

    return results;
  }

  explain(latestPrice: number | null): ModelExplanation {
    const n = this.prices.length;
    return {
      model_family: this.family,
      model_id: this.id,
      top_features: [],
      parameters: { period: PERIOD, residual_scale: Math.round(this.residualScale * 100) / 100 },
      recent_error_band: latestPrice && latestPrice > 0 && this.residualScale > 0
        ? Math.round((this.residualScale / latestPrice) * 10000) / 100
        : null,
      anomaly_flags: [],
      data_summary: {
        n_real_points: n,
        date_range: n ? [this.dates[0], this.dates[n - 1]] : null,
        has_gaps: false,
        missing_ratio: 0,
      },
    };
  }
}
