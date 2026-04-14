/**
 * Champion/challenger model selector.
 *
 * For a given (TimeSeries, horizon), runs all eligible models through
 * rolling-origin cross-validation and elects the champion by lowest sMAPE
 * (fallback: WAPE; fallback: default priority order).
 *
 * Model eligibility:
 *   n < 7            → no models (insufficient)
 *   7 ≤ n < 14       → SeasonalNaive, SMA
 *   14 ≤ n < 30      → + HoltWinters
 *   n ≥ 30           → + GBRT (for horizons where training set ≥ MIN_TRAIN_SAMPLES)
 *
 * Returns ChampionResult with all models' forecasts and metrics, champion flagged.
 */

import type { TimeSeries, ChampionResult, ModelForecastResult } from '../schema/types';
import type { ForecastModel, PredictOptions } from '../models/interface';
import { SeasonalNaiveModel } from '../models/baseline/seasonal-naive';
import { HoltWintersModel }   from '../models/baseline/holt-winters';
import { SMAModel }           from '../models/baseline/sma';
import { GBRTModel }          from '../models/challenger/gbrt';
import { rollbacktest }       from '../evaluation/backtester';
import { NULL_METRICS, type BacktestMetrics } from '../schema/types';

// Default priority order when metrics are tied or unavailable
const DEFAULT_PRIORITY = ['gbrt_mse', 'holt_winters', 'sma', 'seasonal_naive'];

function eligibleModels(n: number): ForecastModel[] {
  const models: ForecastModel[] = [];
  if (n >= 7)  models.push(new SeasonalNaiveModel(), new SMAModel());
  if (n >= 14) models.push(new HoltWintersModel());
  if (n >= 30) models.push(new GBRTModel());
  return models;
}

/**
 * Score for champion selection: lower is better.
 * Primary: sMAPE; secondary: WAPE; tertiary: default priority.
 */
function selectionScore(m: BacktestMetrics): number {
  return m.smape ?? m.wape ?? Infinity;
}

/**
 * Run all eligible models, backtest them, elect champion.
 *
 * @param ts       Preprocessed TimeSeries
 * @param opts     PredictOptions (horizon, stateAverages, hooks)
 * @returns        ChampionResult — all models with metrics, champion flagged.
 */
export function runChampionChallenger(
  ts: TimeSeries,
  opts: PredictOptions,
): ChampionResult {
  const nonNull = ts.points.filter((p) => p.modal_price !== null);
  const n = nonNull.length;

  const models = eligibleModels(n);
  const results: ModelForecastResult[] = [];

  for (const model of models) {
    // Fit on full series
    const fitted = model.fit(ts);
    if (!fitted) continue;

    // Generate full-horizon forecasts
    const points = model.predict(ts, opts);
    if (!points.length) continue;

    // Rolling-origin backtest
    const bt = rollbacktest(model, ts, opts.horizon);
    const metrics = bt?.overall ?? NULL_METRICS;

    // Explanation
    const latestPrice = nonNull.at(-1)?.modal_price ?? null;
    const explanation = model.explain(latestPrice);

    results.push({
      modelId: model.id,
      points,
      metrics,
      explanation,
      is_champion: false, // set below
    });
  }

  if (!results.length) {
    // No model could fit — return empty result
    return { champion_id: 'none', selected_by: 'default', models: [] };
  }

  // ── Champion election ─────────────────────────────────────────────────────

  let championIdx = 0;
  let bestScore   = Infinity;
  let selectedBy: ChampionResult['selected_by'] = 'default';

  for (let i = 0; i < results.length; i++) {
    const score = selectionScore(results[i].metrics);
    if (score < bestScore) {
      bestScore    = score;
      championIdx  = i;
      selectedBy   = results[i].metrics.smape !== null ? 'smape' : 'wape';
    } else if (score === Infinity) {
      // Tie-break by default priority
      const aIdx = DEFAULT_PRIORITY.indexOf(results[i].modelId);
      const bIdx = DEFAULT_PRIORITY.indexOf(results[championIdx].modelId);
      if (aIdx >= 0 && (bIdx < 0 || aIdx < bIdx)) {
        championIdx = i;
        selectedBy  = 'default';
      }
    }
  }

  results[championIdx].is_champion = true;

  return {
    champion_id: results[championIdx].modelId,
    selected_by: selectedBy,
    models: results,
  };
}

/**
 * Extract just the champion's forecast from a ChampionResult.
 */
export function getChampionForecast(result: ChampionResult): ModelForecastResult | null {
  return result.models.find((m) => m.is_champion) ?? null;
}
