import type {
  TimeSeries,
  ChampionResult,
  ModelForecastResult,
  ForecastPoint,
  BacktestMetrics,
  ModelExplanation,
} from '../schema/types';
import type { ForecastModel, PredictOptions } from '../models/interface';
import { LastValueModel } from '../models/baseline/last-value';
import { SeasonalNaiveModel } from '../models/baseline/seasonal-naive';
import { HoltWintersModel } from '../models/baseline/holt-winters';
import { SMAModel } from '../models/baseline/sma';
import { SeasonalARModel } from '../models/baseline/seasonal-ar';
import { GBRTModel } from '../models/challenger/gbrt';
import { rollbacktest, type BacktestResult, type HorizonObservation } from '../evaluation/backtester';
import { computeMetrics } from '../evaluation/metrics';
import { NULL_METRICS } from '../schema/types';

type BenchmarkedModelResult = ModelForecastResult & {
  family: string;
  backtestDetail: BacktestResult;
};

const DEFAULT_PRIORITY = [
  'adaptive_ensemble',
  'horizon_switch',
  'gbrt_mse',
  'seasonal_ar',
  'holt_winters',
  'seasonal_naive',
  'sma',
  'last_value',
];

const STATISTICAL_MODELS = new Set(['last_value', 'seasonal_naive', 'sma', 'holt_winters', 'seasonal_ar']);
const LEARNED_MODELS = new Set(['gbrt_mse']);

function eligibleModels(n: number): ForecastModel[] {
  const models: ForecastModel[] = [];
  if (n >= 2) models.push(new LastValueModel());
  if (n >= 7) models.push(new SeasonalNaiveModel(), new SMAModel());
  if (n >= 14) models.push(new HoltWintersModel());
  if (n >= 21) models.push(new SeasonalARModel());
  if (n >= 30) models.push(new GBRTModel());
  return models;
}

function selectionScore(metrics: BacktestMetrics): number {
  return metrics.smape ?? metrics.wape ?? metrics.mae ?? Infinity;
}

function metricsCloserToTargetCoverage(metrics: BacktestMetrics): number {
  if (metrics.ci_coverage === null) return Infinity;
  return Math.abs(metrics.ci_coverage - 0.8);
}

function betterMetrics(left: BacktestMetrics, right: BacktestMetrics): boolean {
  const leftScore = selectionScore(left);
  const rightScore = selectionScore(right);
  if (leftScore !== rightScore) return leftScore < rightScore;
  return metricsCloserToTargetCoverage(left) < metricsCloserToTargetCoverage(right);
}

function summarizeModelForecast(model: ForecastModel, ts: TimeSeries, opts: PredictOptions): BenchmarkedModelResult | null {
  const fitted = model.fit(ts);
  if (!fitted) return null;

  const points = model.predict(ts, opts);
  if (!points.length) return null;

  const backtestDetail = rollbacktest(model, ts, opts.horizon);
  if (!backtestDetail) return null;

  const latestPrice = ts.points.filter((point) => point.modal_price !== null).at(-1)?.modal_price ?? null;
  const explanation = model.explain(latestPrice);

  return {
    modelId: model.id,
    points,
    metrics: backtestDetail.overall,
    explanation,
    is_champion: false,
    family: model.family,
    backtestDetail,
  };
}

function aggregateExplanation(
  id: string,
  family: string,
  models: BenchmarkedModelResult[],
  weights: Record<string, number>,
): ModelExplanation {
  const featureTotals = new Map<string, { importance: number; directionScore: number }>();

  for (const model of models) {
    const weight = weights[model.modelId] ?? 0;
    for (const feature of model.explanation.top_features) {
      const entry = featureTotals.get(feature.feature_name) ?? { importance: 0, directionScore: 0 };
      entry.importance += feature.importance * weight;
      entry.directionScore +=
        feature.direction === 'positive' ? weight
          : feature.direction === 'negative' ? -weight
          : 0;
      featureTotals.set(feature.feature_name, entry);
    }
  }

  const topFeatures = [...featureTotals.entries()]
    .map(([feature_name, value]) => ({
      feature_name,
      importance: Math.round(value.importance * 1000) / 1000,
      direction: value.directionScore > 0.1 ? 'positive' as const : value.directionScore < -0.1 ? 'negative' as const : 'mixed' as const,
    }))
    .filter((feature) => feature.importance > 0.015)
    .sort((left, right) => right.importance - left.importance)
    .slice(0, 6);

  const anomaly_flags = models
    .flatMap((model) => model.explanation.anomaly_flags)
    .slice(0, 6);

  const recent_error_bandCandidates = models
    .map((model) => model.explanation.recent_error_band)
    .filter((value): value is number => value !== null);

  const parameters = Object.fromEntries(
    Object.entries(weights)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => [`weight_${key}`, Math.round(value * 1000) / 1000])
  );

  const dateRange = models
    .map((model) => model.explanation.data_summary.date_range)
    .filter((range): range is [string, string] => !!range)
    .sort((left, right) => left[0].localeCompare(right[0]));

  const firstRange = dateRange.at(0) ?? null;
  const lastRange = dateRange.at(-1) ?? null;

  return {
    model_family: family,
    model_id: id,
    top_features: topFeatures,
    parameters,
    recent_error_band: recent_error_bandCandidates.length
      ? Math.round((recent_error_bandCandidates.reduce((sum, value) => sum + value, 0) / recent_error_bandCandidates.length) * 100) / 100
      : null,
    anomaly_flags,
    data_summary: {
      n_real_points: Math.max(...models.map((model) => model.explanation.data_summary.n_real_points), 0),
      date_range: firstRange && lastRange ? [firstRange[0], lastRange[1]] : null,
      has_gaps: models.some((model) => model.explanation.data_summary.has_gaps),
      missing_ratio: Math.max(...models.map((model) => model.explanation.data_summary.missing_ratio), 0),
    },
  };
}

function combineObservations(
  left: HorizonObservation[],
  right: HorizonObservation[],
  leftWeight: number,
  rightWeight: number,
): HorizonObservation[] {
  const rightByOrigin = new Map<number, HorizonObservation>(right.map((observation) => [observation.origin, observation]));
  return left
    .map((observation) => {
      const paired = rightByOrigin.get(observation.origin);
      if (!paired) return null;
      const predicted = leftWeight * observation.predicted + rightWeight * paired.predicted;
      const disagreement = Math.abs(observation.predicted - paired.predicted);
      const lower = Math.min(
        leftWeight * observation.lower + rightWeight * paired.lower,
        predicted - disagreement * 0.15,
      );
      const upper = Math.max(
        leftWeight * observation.upper + rightWeight * paired.upper,
        predicted + disagreement * 0.15,
      );
      return {
        origin: observation.origin,
        actual: observation.actual,
        predicted,
        lower,
        upper,
      };
    })
    .filter((observation): observation is HorizonObservation => observation !== null);
}

function buildMetricsFromObservations(observations: HorizonObservation[]): BacktestMetrics {
  return computeMetrics(
    observations.map((observation) => observation.actual),
    observations.map((observation) => observation.predicted),
    observations.map((observation) => observation.lower),
    observations.map((observation) => observation.upper),
  );
}

function buildHorizonSwitch(results: BenchmarkedModelResult[], horizon: number): BenchmarkedModelResult | null {
  if (results.length < 2) return null;

  const selectedByHorizon = new Map<number, BenchmarkedModelResult>();
  for (let h = 1; h <= horizon; h++) {
    const candidates = results.filter((result) => result.backtestDetail.byHorizon.has(h));
    if (!candidates.length) continue;
    candidates.sort((left, right) => selectionScore(left.backtestDetail.byHorizon.get(h) ?? NULL_METRICS) - selectionScore(right.backtestDetail.byHorizon.get(h) ?? NULL_METRICS));
    selectedByHorizon.set(h, candidates[0]);
  }

  if (!selectedByHorizon.size) return null;

  const points: ForecastPoint[] = [];
  const byHorizon = new Map<number, BacktestMetrics>();
  const observationsByHorizon = new Map<number, HorizonObservation[]>();
  const pooled: HorizonObservation[] = [];
  const weights: Record<string, number> = {};

  for (let h = 1; h <= horizon; h++) {
    const selected = selectedByHorizon.get(h);
    if (!selected) continue;
    const point = selected.points.find((entry) => entry.horizon_days === h);
    const metrics = selected.backtestDetail.byHorizon.get(h);
    const observations = selected.backtestDetail.observationsByHorizon.get(h);
    if (!point || !metrics || !observations) continue;
    points.push(point);
    byHorizon.set(h, metrics);
    observationsByHorizon.set(h, observations);
    pooled.push(...observations);
    weights[selected.modelId] = (weights[selected.modelId] ?? 0) + 1 / horizon;
  }

  if (!points.length || !pooled.length) return null;

  const explanation = aggregateExplanation('horizon_switch', 'Adaptive Horizon Switch', results, weights);
  return {
    modelId: 'horizon_switch',
    points,
    metrics: buildMetricsFromObservations(pooled),
    explanation,
    is_champion: false,
    family: 'Adaptive Horizon Switch',
    backtestDetail: {
      overall: buildMetricsFromObservations(pooled),
      byHorizon,
      observationsByHorizon,
      n_origins: new Set(pooled.map((observation) => observation.origin)).size,
    },
  };
}

function buildAdaptiveEnsemble(results: BenchmarkedModelResult[], horizon: number): BenchmarkedModelResult | null {
  const bestStatistical = [...results]
    .filter((result) => STATISTICAL_MODELS.has(result.modelId))
    .sort((left, right) => selectionScore(left.metrics) - selectionScore(right.metrics))[0];
  const bestLearned = [...results]
    .filter((result) => LEARNED_MODELS.has(result.modelId))
    .sort((left, right) => selectionScore(left.metrics) - selectionScore(right.metrics))[0];

  if (!bestStatistical || !bestLearned) return null;

  const points: ForecastPoint[] = [];
  const byHorizon = new Map<number, BacktestMetrics>();
  const observationsByHorizon = new Map<number, HorizonObservation[]>();
  const pooled: HorizonObservation[] = [];
  const weights: Record<string, number> = { [bestStatistical.modelId]: 0.5, [bestLearned.modelId]: 0.5 };

  for (let h = 1; h <= horizon; h++) {
    const statPoint = bestStatistical.points.find((point) => point.horizon_days === h);
    const learnedPoint = bestLearned.points.find((point) => point.horizon_days === h);
    const statMetrics = bestStatistical.backtestDetail.byHorizon.get(h);
    const learnedMetrics = bestLearned.backtestDetail.byHorizon.get(h);
    const statObs = bestStatistical.backtestDetail.observationsByHorizon.get(h);
    const learnedObs = bestLearned.backtestDetail.observationsByHorizon.get(h);
    if (!statPoint || !learnedPoint || !statMetrics || !learnedMetrics || !statObs || !learnedObs) continue;

    const statScore = Math.max(selectionScore(statMetrics), 0.001);
    const learnedScore = Math.max(selectionScore(learnedMetrics), 0.001);
    const statWeight = 1 / statScore;
    const learnedWeight = 1 / learnedScore;
    const total = statWeight + learnedWeight;
    const ws = statWeight / total;
    const wl = learnedWeight / total;

    const point = ws * statPoint.point + wl * learnedPoint.point;
    const disagreement = Math.abs(statPoint.point - learnedPoint.point);
    points.push({
      date: statPoint.date,
      horizon_days: h,
      point: Math.round(point * 100) / 100,
      lower: Math.max(0, Math.round((ws * statPoint.lower + wl * learnedPoint.lower - disagreement * 0.15) * 100) / 100),
      upper: Math.round((ws * statPoint.upper + wl * learnedPoint.upper + disagreement * 0.15) * 100) / 100,
    });

    const observations = combineObservations(statObs, learnedObs, ws, wl);
    if (!observations.length) continue;
    const metrics = buildMetricsFromObservations(observations);
    byHorizon.set(h, metrics);
    observationsByHorizon.set(h, observations);
    pooled.push(...observations);

    weights[bestStatistical.modelId] += ws / horizon;
    weights[bestLearned.modelId] += wl / horizon;
  }

  if (!points.length || !pooled.length) return null;

  const overall = buildMetricsFromObservations(pooled);
  const bestSingle = [bestStatistical.metrics, bestLearned.metrics].sort((left, right) => selectionScore(left) - selectionScore(right))[0];
  if (!(selectionScore(overall) < selectionScore(bestSingle) * 0.995)) {
    return null;
  }

  const explanation = aggregateExplanation('adaptive_ensemble', 'Adaptive Ensemble', [bestStatistical, bestLearned], weights);
  return {
    modelId: 'adaptive_ensemble',
    points,
    metrics: overall,
    explanation,
    is_champion: false,
    family: 'Adaptive Ensemble',
    backtestDetail: {
      overall,
      byHorizon,
      observationsByHorizon,
      n_origins: new Set(pooled.map((observation) => observation.origin)).size,
    },
  };
}

export function runChampionChallenger(ts: TimeSeries, opts: PredictOptions): ChampionResult {
  const nonNull = ts.points.filter((point) => point.modal_price !== null);
  const models = eligibleModels(nonNull.length);
  const results: BenchmarkedModelResult[] = models
    .map((model) => summarizeModelForecast(model, ts, opts))
    .filter((result): result is BenchmarkedModelResult => result !== null);

  if (!results.length) return { champion_id: 'none', selected_by: 'default', models: [] };

  const horizonSwitch = buildHorizonSwitch(results, opts.horizon);
  const adaptiveEnsemble = buildAdaptiveEnsemble(results, opts.horizon);
  if (horizonSwitch) results.push(horizonSwitch);
  if (adaptiveEnsemble) results.push(adaptiveEnsemble);

  let championIndex = 0;
  let selectedBy: ChampionResult['selected_by'] = 'default';

  for (let index = 1; index < results.length; index++) {
    if (betterMetrics(results[index].metrics, results[championIndex].metrics)) {
      championIndex = index;
      selectedBy = results[index].metrics.smape !== null ? 'smape' : results[index].metrics.wape !== null ? 'wape' : 'default';
      continue;
    }

    const leftScore = selectionScore(results[index].metrics);
    const rightScore = selectionScore(results[championIndex].metrics);
    if (leftScore === rightScore) {
      const leftPriority = DEFAULT_PRIORITY.indexOf(results[index].modelId);
      const rightPriority = DEFAULT_PRIORITY.indexOf(results[championIndex].modelId);
      if (leftPriority >= 0 && (rightPriority < 0 || leftPriority < rightPriority)) {
        championIndex = index;
        selectedBy = 'default';
      }
    }
  }

  results[championIndex].is_champion = true;

  return {
    champion_id: results[championIndex].modelId,
    selected_by: selectedBy,
    models: results.map(({ backtestDetail: _detail, family: _family, ...result }) => result),
  };
}

export function getChampionForecast(result: ChampionResult): ModelForecastResult | null {
  return result.models.find((model) => model.is_champion) ?? null;
}
