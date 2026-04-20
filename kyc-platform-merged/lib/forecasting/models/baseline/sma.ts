/**
 * Simple Moving Average (SMA) baseline model.
 *
 * Forecast: ŷ_{t+h} = mean(y_{t−k+1} ... y_t)  for all h ∈ [1, horizon]
 *   (flat forecast — all horizons get the same point estimate)
 *
 * Bandwidth k selected from {3, 5, 7} by minimising in-sample RMSE.
 * Interval: ±1.28 × in-sample residual std (80% CI).
 *
 * Requires: ≥ 3 data points.
 */

import type { TimeSeries, ForecastPoint, ModelExplanation } from '../../schema/types';
import type { ForecastModel, PredictOptions } from '../interface';
import {
  getObservedPoints,
  intervalHalfWidth,
  forecastDatesFromSeries,
  boundedForecastPoint,
} from '../utils';

const K_OPTIONS = [3, 5, 7];

function smaRMSE(y: number[], k: number): number {
  let sumSq = 0, cnt = 0;
  for (let t = k; t < y.length; t++) {
    const pred = y.slice(t - k, t).reduce((s, v) => s + v, 0) / k;
    sumSq += (y[t] - pred) ** 2;
    cnt++;
  }
  return cnt ? Math.sqrt(sumSq / cnt) : Infinity;
}

function smaResiduals(y: number[], k: number): number[] {
  const res: number[] = [];
  for (let t = k; t < y.length; t++) {
    const pred = y.slice(t - k, t).reduce((s, v) => s + v, 0) / k;
    res.push(y[t] - pred);
  }
  return res;
}

export class SMAModel implements ForecastModel {
  readonly id = 'sma';
  readonly name = 'Simple Moving Average';
  readonly family = 'SMA';
  readonly minDataPoints = 3;

  private fitted = false;
  private k = 7;
  private point = 0;
  private residualScale = 0;
  private prices: number[] = [];
  private dates: string[] = [];

  fit(ts: TimeSeries): boolean {
    const valid = getObservedPoints(ts);

    if (valid.length < this.minDataPoints) {
      this.fitted = false;
      return false;
    }

    this.prices = valid.map((v) => v.price);
    this.dates  = valid.map((v) => v.date);

    // Select k by minimum RMSE
    let bestK = K_OPTIONS[0];
    let bestRMSE = Infinity;
    for (const k of K_OPTIONS) {
      if (this.prices.length >= k) {
        const rmse = smaRMSE(this.prices, k);
        if (rmse < bestRMSE) { bestRMSE = rmse; bestK = k; }
      }
    }
    this.k = bestK;

    // Point forecast: mean of the last k values
    const window = this.prices.slice(-this.k);
    this.point = window.reduce((s, v) => s + v, 0) / window.length;

    // Residual std for CI
    const residuals = smaResiduals(this.prices, this.k);
    if (residuals.length >= 2) {
      const mu  = residuals.reduce((s, v) => s + v, 0) / residuals.length;
      const var_ = residuals.reduce((s, v) => s + (v - mu) ** 2, 0) / (residuals.length - 1);
      this.residualScale = Math.sqrt(var_);
    }

    this.fitted = true;
    return true;
  }

  predict(_ts: TimeSeries, opts: PredictOptions): ForecastPoint[] {
    if (!this.fitted) return [];
    return forecastDatesFromSeries(_ts, opts.horizon).map((date, index) =>
      boundedForecastPoint(
        this.point,
        intervalHalfWidth(this.residualScale, this.prices, index + 1, _ts, 1.18),
        date,
        index + 1,
      )
    );
  }

  explain(latestPrice: number | null): ModelExplanation {
    const n = this.prices.length;
    return {
      model_family: this.family,
      model_id: this.id,
      top_features: [],
      parameters: {
        k: this.k,
        point_forecast: Math.round(this.point * 100) / 100,
        residual_scale: Math.round(this.residualScale * 100) / 100,
      },
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
