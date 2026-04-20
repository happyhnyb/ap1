import type { TimeSeries, ForecastPoint, ModelExplanation } from '../../schema/types';
import type { ForecastModel, PredictOptions } from '../interface';
import {
  getObservedPoints,
  intervalHalfWidth,
  forecastDatesFromSeries,
  robustResidualScale,
  boundedForecastPoint,
} from '../utils';

export class LastValueModel implements ForecastModel {
  readonly id = 'last_value';
  readonly name = 'Last Value';
  readonly family = 'Naive Last Value';
  readonly minDataPoints = 2;

  private fitted = false;
  private prices: number[] = [];
  private dates: string[] = [];
  private residualScale = 0;

  fit(ts: TimeSeries): boolean {
    const observed = getObservedPoints(ts);
    if (observed.length < this.minDataPoints) {
      this.fitted = false;
      return false;
    }

    this.prices = observed.map((point) => point.price);
    this.dates = observed.map((point) => point.date);
    const residuals = this.prices.slice(1).map((price, index) => price - this.prices[index]);
    this.residualScale = robustResidualScale(residuals);
    this.fitted = true;
    return true;
  }

  predict(ts: TimeSeries, opts: PredictOptions): ForecastPoint[] {
    if (!this.fitted || !this.prices.length) return [];
    const dates = forecastDatesFromSeries(ts, opts.horizon);
    const lastPrice = this.prices.at(-1) ?? 0;
    return dates.map((date, index) =>
      boundedForecastPoint(
        lastPrice,
        intervalHalfWidth(this.residualScale, this.prices, index + 1, ts, 1.15),
        date,
        index + 1,
      )
    );
  }

  explain(latestPrice: number | null): ModelExplanation {
    return {
      model_family: this.family,
      model_id: this.id,
      top_features: [],
      parameters: {
        residual_scale: Math.round(this.residualScale * 100) / 100,
      },
      recent_error_band: latestPrice && latestPrice > 0
        ? Math.round(((this.residualScale / latestPrice) * 100) * 100) / 100
        : null,
      anomaly_flags: [],
      data_summary: {
        n_real_points: this.prices.length,
        date_range: this.dates.length ? [this.dates[0], this.dates.at(-1)!] : null,
        has_gaps: false,
        missing_ratio: 0,
      },
    };
  }
}
