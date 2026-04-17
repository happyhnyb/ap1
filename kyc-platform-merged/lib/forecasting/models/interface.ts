/**
 * Model interface contract.
 *
 * Every forecasting model (baseline or challenger) must implement ForecastModel.
 * The engine calls fit() once, then predict() for each horizon.
 */

import type {
  TimeSeries,
  ForecastPoint,
  ModelExplanation,
} from '../schema/types';
import type { ExternalFeatureHooks } from '../features/index';

export interface PredictOptions {
  horizon: number;          // max horizon to forecast (1–14)
  stateAverages?: Map<string, number>;
  hooks?: ExternalFeatureHooks;
}

export interface ForecastModel {
  /** Unique identifier for this model (e.g. "holt_winters", "gbrt_mse"). */
  readonly id: string;
  /** Human-readable name for display. */
  readonly name: string;
  /** Model family for the explanation layer. */
  readonly family: string;

  /**
   * Train the model on the given time series.
   * Returns false if the series has insufficient data.
   */
  fit(ts: TimeSeries): boolean;

  /**
   * Generate point + interval forecasts for horizons 1..opts.horizon.
   * Called only after a successful fit().
   */
  predict(ts: TimeSeries, opts: PredictOptions): ForecastPoint[];

  /**
   * Return an explanation object for this model's last prediction.
   * Called after predict().
   */
  explain(latestPrice: number | null): ModelExplanation;

  /**
   * Minimum number of data points required to fit this model.
   */
  readonly minDataPoints: number;
}

// ── Shared utility ─────────────────────────────────────────────────────────────

/** Format ₹/quintal with Indian locale. */
export function fmtPrice(p: number): string {
  return `₹${Math.round(p).toLocaleString('en-IN')}`;
}

/** Build a direction string from trend percentage. */
export function trendDirection(trendPct: number): 'up' | 'down' | 'flat' {
  return trendPct > 1 ? 'up' : trendPct < -1 ? 'down' : 'flat';
}
