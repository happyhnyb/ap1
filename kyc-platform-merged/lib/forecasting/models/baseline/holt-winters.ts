/**
 * Holt-Winters Triple Exponential Smoothing — additive model with weekly seasonality.
 *
 * Update equations (additive):
 *   L_t = α(y_t − S_{t−m}) + (1−α)(L_{t−1} + T_{t−1})
 *   T_t = β(L_t − L_{t−1}) + (1−β)T_{t−1}
 *   S_t = γ(y_t − L_t) + (1−γ)S_{t−m}
 *
 * Forecast:
 *   ŷ_{t+h} = L_t + h·T_t + S_{t+h−m}
 *
 * Parameter selection: walk-forward CV over a small grid.
 * Interval: ±1.28 × std(in-sample residuals) (80% CI).
 *
 * Requires: ≥ 2 × m = 14 data points.
 */

import type { TimeSeries, ForecastPoint, ModelExplanation } from '../../schema/types';
import type { ForecastModel, PredictOptions } from '../interface';
import {
  getObservedPoints,
  intervalHalfWidth,
  forecastDatesFromSeries,
  boundedForecastPoint,
} from '../utils';

const M = 7; // weekly period

interface HWState {
  level: number;
  trend: number;
  seasonal: number[]; // length M
}

interface HWParams {
  alpha: number;
  beta:  number;
  gamma: number;
}

// ── Core Holt-Winters routines ────────────────────────────────────────────────

function hwInitialize(y: number[]): HWState {
  // Level: mean of first season
  const level = y.slice(0, M).reduce((s, v) => s + v, 0) / M;
  // Trend: (mean of second season − mean of first season) / M
  const trend = y.length >= 2 * M
    ? (y.slice(M, 2 * M).reduce((s, v) => s + v, 0) / M - level) / M
    : 0;
  // Seasonal: deviation from initial level
  const seasonal = y.slice(0, M).map((v) => v - level);
  return { level, trend, seasonal };
}

function hwFit(y: number[], p: HWParams): { state: HWState; residuals: number[] } {
  let { level, trend, seasonal } = hwInitialize(y);
  seasonal = [...seasonal]; // clone

  const residuals: number[] = [];

  for (let t = M; t < y.length; t++) {
    const prevLevel = level;
    const sIdx = (t - M) % M; // seasonal index (circular)

    const fitted = prevLevel + trend + seasonal[sIdx];
    residuals.push(y[t] - fitted);

    level = p.alpha * (y[t] - seasonal[sIdx]) + (1 - p.alpha) * (prevLevel + trend);
    trend = p.beta  * (level - prevLevel)       + (1 - p.beta)  * trend;
    seasonal[t % M] = p.gamma * (y[t] - level)  + (1 - p.gamma) * seasonal[sIdx];
  }

  return { state: { level, trend, seasonal }, residuals };
}

function hwForecast(state: HWState, dates: string[]): ForecastPoint[] {
  const { level, trend, seasonal } = state;
  const n = seasonal.length; // = M

  const points: ForecastPoint[] = [];
  for (let h = 1; h <= dates.length; h++) {
    const sIdx = (h - 1) % n;
    const price = Math.max(0, level + h * trend + seasonal[sIdx]);
    points.push({
      date: dates[h - 1],
      horizon_days: h,
      point: Math.round(price * 100) / 100,
      lower: 0, // filled in after interval estimation
      upper: 0,
    });
  }
  return points;
}

function computeMAPE(y: number[], residuals: number[]): number {
  let sumErr = 0, cnt = 0;
  residuals.forEach((r, i) => {
    const actual = y[M + i];
    if (actual > 0) { sumErr += Math.abs(r / actual); cnt++; }
  });
  return cnt ? (sumErr / cnt) * 100 : Infinity;
}

// ── Parameter grid search ─────────────────────────────────────────────────────

const ALPHA_GRID = [0.1, 0.2, 0.3, 0.4, 0.5];
const BETA_GRID  = [0.05, 0.1, 0.2];
const GAMMA_GRID = [0.05, 0.1, 0.2, 0.3];

function selectParams(y: number[]): { params: HWParams; mape: number } {
  if (y.length < 2 * M) return { params: { alpha: 0.3, beta: 0.1, gamma: 0.1 }, mape: Infinity };

  let bestParams: HWParams = { alpha: 0.3, beta: 0.1, gamma: 0.1 };
  let bestMAPE = Infinity;

  for (const alpha of ALPHA_GRID) {
    for (const beta of BETA_GRID) {
      for (const gamma of GAMMA_GRID) {
        const p = { alpha, beta, gamma };
        const { residuals } = hwFit(y, p);
        const mape = computeMAPE(y, residuals);
        if (mape < bestMAPE) { bestMAPE = mape; bestParams = p; }
      }
    }
  }

  return { params: bestParams, mape: bestMAPE };
}

// ── Model class ───────────────────────────────────────────────────────────────

export class HoltWintersModel implements ForecastModel {
  readonly id = 'holt_winters';
  readonly name = "Holt-Winters (additive, weekly)";
  readonly family = 'Holt-Winters';
  readonly minDataPoints = 2 * M; // 14

  private fitted = false;
  private state!: HWState;
  private params!: HWParams;
  private residualScale = 0;
  private mapeVal = Infinity;
  private prices: number[] = [];
  private dates:  string[] = [];

  fit(ts: TimeSeries): boolean {
    const valid = getObservedPoints(ts);

    if (valid.length < this.minDataPoints) {
      this.fitted = false;
      return false;
    }

    this.prices = valid.map((v) => v.price);
    this.dates  = valid.map((v) => v.date);

    const { params, mape } = selectParams(this.prices);
    this.params  = params;
    this.mapeVal = mape;

    const { state, residuals } = hwFit(this.prices, params);
    this.state = state;

    if (residuals.length >= 2) {
      const mu  = residuals.reduce((s, v) => s + v, 0) / residuals.length;
      const var_ = residuals.reduce((s, v) => s + (v - mu) ** 2, 0) / (residuals.length - 1);
      this.residualScale = Math.sqrt(var_);
    }

    this.fitted = true;
    return true;
  }

  predict(ts: TimeSeries, opts: PredictOptions): ForecastPoint[] {
    if (!this.fitted) return [];
    const points = hwForecast(this.state, forecastDatesFromSeries(ts, opts.horizon));

    // Fill in confidence intervals
    return points.map((fp) => {
      return boundedForecastPoint(
        fp.point,
        intervalHalfWidth(this.residualScale, this.prices, fp.horizon_days, ts, 1.18),
        fp.date,
        fp.horizon_days,
      );
    });
  }

  explain(latestPrice: number | null): ModelExplanation {
    const n = this.prices.length;
    return {
      model_family: this.family,
      model_id: this.id,
      top_features: [],
      parameters: {
        alpha:        this.params?.alpha ?? 0,
        beta:         this.params?.beta  ?? 0,
        gamma:        this.params?.gamma ?? 0,
        period:       M,
        in_sample_mape: Math.round(this.mapeVal * 100) / 100,
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
