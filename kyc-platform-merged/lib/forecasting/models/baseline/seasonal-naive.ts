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

const PERIOD = 7; // weekly seasonality

export class SeasonalNaiveModel implements ForecastModel {
  readonly id = 'seasonal_naive';
  readonly name = 'Seasonal Naive (weekly)';
  readonly family = 'Seasonal Naive';
  readonly minDataPoints = PERIOD;

  private fitted = false;
  private prices: number[] = [];
  private dates:  string[] = [];
  private residualStd = 0;

  fit(ts: TimeSeries): boolean {
    const valid = ts.points
      .filter((p) => p.modal_price !== null)
      .map((p) => ({ date: p.date, price: p.modal_price as number }));

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
      this.residualStd = Math.sqrt(variance);
    } else {
      this.residualStd = 0;
    }

    this.fitted = true;
    return true;
  }

  predict(ts: TimeSeries, opts: PredictOptions): ForecastPoint[] {
    if (!this.fitted) return [];
    const { horizon } = opts;
    const n = this.prices.length;

    const today = new Date();
    const results: ForecastPoint[] = [];

    for (let h = 1; h <= horizon; h++) {
      // Look back L days, wrapping within the available history
      const sourceIdx = n - PERIOD + ((h - 1) % PERIOD);
      const clampedIdx = Math.max(0, Math.min(n - 1, sourceIdx));
      const point = this.prices[clampedIdx];

      // 80% CI: ±1.28σ, scaled slightly wider with horizon
      const halfWidth = this.residualStd * 1.28 * (1 + (h - 1) * 0.05);

      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() + h);

      results.push({
        date: date.toISOString().slice(0, 10),
        horizon_days: h,
        point: Math.round(point * 100) / 100,
        lower: Math.max(0, Math.round((point - halfWidth) * 100) / 100),
        upper: Math.round((point + halfWidth) * 100) / 100,
      });
    }

    return results;
  }

  explain(latestPrice: number | null): ModelExplanation {
    const n = this.prices.length;
    return {
      model_family: this.family,
      model_id: this.id,
      top_features: [],
      parameters: { period: PERIOD, residual_std: Math.round(this.residualStd * 100) / 100 },
      recent_error_band: latestPrice && latestPrice > 0 && this.residualStd > 0
        ? Math.round((this.residualStd / latestPrice) * 10000) / 100
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
