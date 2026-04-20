import fs from 'fs';
import path from 'path';
import type {
  BacktestMetrics,
  ChampionResult,
  ForecastPoint,
  ModelExplanation,
  TimeSeries,
} from './schema/types';
import type { ForecastModel, PredictOptions } from './models/interface';
import { loadRecords } from './data/loader';
import { buildTimeSeries } from './preprocessing/pipeline';
import { defaultHooks } from './features/index';
import { rollbacktest } from './evaluation/backtester';
import { runChampionChallenger, getChampionForecast } from './selection/selector';
import { holtForecast } from '../mandi/engine';
import { forecastDatesFromSeries, getObservedPrices } from './models/utils';

export type BenchmarkOptions = {
  horizon?: number;
  minRealPoints?: number;
  maxSeries?: number;
  outputPath?: string;
};

export type BenchmarkSeriesRow = {
  commodity: string;
  state: string;
  market: string;
  realPoints: number;
  baseline: BacktestMetrics;
  champion: BacktestMetrics;
  championId: string;
};

export type BenchmarkModelSummary = {
  modelId: string;
  avgMae: number | null;
  avgRmse: number | null;
  avgSmape: number | null;
  avgDirectionalAccuracy: number | null;
  avgCoverage: number | null;
  evaluatedSeries: number;
  championWins: number;
};

export type BenchmarkReport = {
  generatedAt: string;
  source: 'snapshots' | 'agmarknet' | 'seed' | 'mongodb';
  snapshotCount: number;
  horizon: number;
  minRealPoints: number;
  totalEligibleSeries: number;
  benchmarkedSeries: number;
  before: BenchmarkModelSummary;
  after: BenchmarkModelSummary;
  byModel: BenchmarkModelSummary[];
  winnerCounts: Record<string, number>;
  series: BenchmarkSeriesRow[];
};

function round(value: number | null): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.round(value * 1000) / 1000;
}

function average(values: Array<number | null>): number | null {
  const clean = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (!clean.length) return null;
  return round(clean.reduce((sum, value) => sum + value, 0) / clean.length);
}

function summarizeModelRows(
  modelId: string,
  metricsRows: BacktestMetrics[],
  championWins: number,
): BenchmarkModelSummary {
  return {
    modelId,
    avgMae: average(metricsRows.map((metrics) => metrics.mae)),
    avgRmse: average(metricsRows.map((metrics) => metrics.rmse)),
    avgSmape: average(metricsRows.map((metrics) => metrics.smape)),
    avgDirectionalAccuracy: average(metricsRows.map((metrics) => metrics.directional_accuracy)),
    avgCoverage: average(metricsRows.map((metrics) => metrics.ci_coverage)),
    evaluatedSeries: metricsRows.length,
    championWins,
  };
}

class LegacyHoltModel implements ForecastModel {
  readonly id = 'legacy_holt';
  readonly name = 'Legacy Holt fallback';
  readonly family = 'Legacy Holt';
  readonly minDataPoints = 7;

  private prices: number[] = [];
  private fitted = false;

  fit(ts: TimeSeries): boolean {
    this.prices = getObservedPrices(ts);
    this.fitted = this.prices.length >= this.minDataPoints;
    return this.fitted;
  }

  predict(ts: TimeSeries, opts: PredictOptions): ForecastPoint[] {
    if (!this.fitted) return [];
    const result = holtForecast(this.prices, opts.horizon);
    if (!result) return [];
    const dates = forecastDatesFromSeries(ts, opts.horizon);
    return result.forecast.slice(0, opts.horizon).map((point, index) => ({
      date: dates[index] ?? point.date,
      horizon_days: index + 1,
      point: point.price,
      lower: point.lower,
      upper: point.upper,
    }));
  }

  explain(): ModelExplanation {
    return {
      model_family: this.family,
      model_id: this.id,
      top_features: [],
      parameters: {},
      recent_error_band: null,
      anomaly_flags: [],
      data_summary: {
        n_real_points: this.prices.length,
        date_range: null,
        has_gaps: false,
        missing_ratio: 0,
      },
    };
  }
}

async function writeReport(outputPath: string, report: BenchmarkReport): Promise<void> {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
}

function buildStateAverages(allSeries: TimeSeries[], targetCommodityId: string, targetState: string): Map<string, number> {
  const sameState = allSeries.filter(
    (series) => series.commodity_id === targetCommodityId && series.state === targetState,
  );
  const byDate = new Map<string, number[]>();
  for (const series of sameState) {
    for (const point of series.points) {
      if (point.modal_price === null) continue;
      const rows = byDate.get(point.date) ?? [];
      rows.push(point.modal_price);
      byDate.set(point.date, rows);
    }
  }

  return new Map<string, number>(
    [...byDate.entries()].map(([date, values]) => [date, values.reduce((sum, value) => sum + value, 0) / values.length]),
  );
}

function pickSeries(allSeries: TimeSeries[], minRealPoints: number, maxSeries?: number): TimeSeries[] {
  const eligible = allSeries
    .filter((series) => series.real_count >= minRealPoints)
    .sort((left, right) => {
      if (right.real_count !== left.real_count) return right.real_count - left.real_count;
      return left.commodity.localeCompare(right.commodity) || left.market.localeCompare(right.market);
    });

  if (!maxSeries || eligible.length <= maxSeries) return eligible;

  const selected: TimeSeries[] = [];
  const perCommodity = new Map<string, number>();
  for (const series of eligible) {
    const used = perCommodity.get(series.commodity_id) ?? 0;
    if (used >= Math.max(2, Math.floor(maxSeries / 8))) continue;
    perCommodity.set(series.commodity_id, used + 1);
    selected.push(series);
    if (selected.length >= maxSeries) break;
  }

  if (selected.length < maxSeries) {
    for (const series of eligible) {
      if (selected.includes(series)) continue;
      selected.push(series);
      if (selected.length >= maxSeries) break;
    }
  }

  return selected;
}

export async function benchmarkForecasters(options: BenchmarkOptions = {}): Promise<BenchmarkReport> {
  const horizon = Math.min(14, Math.max(3, options.horizon ?? 14));
  const minRealPoints = Math.max(14, options.minRealPoints ?? 35);
  const loaded = await loadRecords();
  const allSeries = [...buildTimeSeries(loaded.records, loaded.fetchedAt).values()];
  const selectedSeries = pickSeries(allSeries, minRealPoints, options.maxSeries);

  const metricsByModel = new Map<string, BacktestMetrics[]>();
  const winnerCounts = new Map<string, number>();
  const perSeriesRows: BenchmarkSeriesRow[] = [];

  for (const series of selectedSeries) {
    const selection: ChampionResult = runChampionChallenger(series, {
      horizon,
      stateAverages: buildStateAverages(allSeries, series.commodity_id, series.state),
      hooks: defaultHooks,
    });
    const champion = getChampionForecast(selection);
    if (!champion) continue;

    const baseline = rollbacktest(new LegacyHoltModel(), series, horizon)?.overall;
    if (!baseline) continue;

    perSeriesRows.push({
      commodity: series.commodity,
      state: series.state,
      market: series.market,
      realPoints: series.real_count,
      baseline,
      champion: champion.metrics,
      championId: champion.modelId,
    });

    winnerCounts.set(champion.modelId, (winnerCounts.get(champion.modelId) ?? 0) + 1);
    metricsByModel.set('legacy_holt', [...(metricsByModel.get('legacy_holt') ?? []), baseline]);
    for (const model of selection.models) {
      metricsByModel.set(model.modelId, [...(metricsByModel.get(model.modelId) ?? []), model.metrics]);
    }
  }

  const before = summarizeModelRows('legacy_holt', metricsByModel.get('legacy_holt') ?? [], 0);
  const afterChampionRows = perSeriesRows.map((row) => row.champion);
  const afterChampionId = [...winnerCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'mixed';
  const after = summarizeModelRows(afterChampionId, afterChampionRows, 0);

  const byModel = [...metricsByModel.keys()]
    .map((modelId) => summarizeModelRows(modelId, metricsByModel.get(modelId) ?? [], winnerCounts.get(modelId) ?? 0))
    .filter((row) => row.evaluatedSeries > 0)
    .sort((left, right) => (left.avgSmape ?? Infinity) - (right.avgSmape ?? Infinity));

  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    source: loaded.source,
    snapshotCount: loaded.snapshotCount,
    horizon,
    minRealPoints,
    totalEligibleSeries: allSeries.filter((series) => series.real_count >= minRealPoints).length,
    benchmarkedSeries: perSeriesRows.length,
    before,
    after,
    byModel,
    winnerCounts: Object.fromEntries([...winnerCounts.entries()].sort((left, right) => right[1] - left[1])),
    series: perSeriesRows,
  };

  if (options.outputPath) await writeReport(options.outputPath, report);
  return report;
}
