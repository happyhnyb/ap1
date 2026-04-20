/**
 * Forecasting Engine — main orchestrator.
 *
 * Public API:
 *   engine.forecast(query)        → ForecastResponse
 *   engine.compare(query)         → CompareResponse
 *   engine.quality(query)         → QualityResponse
 *   engine.drivers(query)         → DriversResponse
 *
 * Each call:
 *   1. Loads records (snapshots → Agmarknet fallback)
 *   2. Preprocesses → TimeSeries map
 *   3. Finds the (commodity, mandi) series
 *   4. Runs champion/challenger selection
 *   5. Returns typed response
 *
 * NOTE: No in-process caching here — callers should use Next.js fetch cache
 * or unstable_cache() for response-level caching.
 */

import type {
  TimeSeries,
  ForecastResponse,
  CompareResponse,
  QualityResponse,
  DriversResponse,
  ForecastMeta,
  ChampionResult,
} from './schema/types';
import type { ExternalFeatureHooks } from './features/index';
import { defaultHooks } from './features/index';
import { normalizeCommodity, displayName, normalizeLabel } from './schema/commodity';
import { buildTimeSeries } from './preprocessing/pipeline';
import { summarizeQuality } from './preprocessing/quality';
import { loadRecords } from './data/loader';
import { runChampionChallenger, getChampionForecast } from './selection/selector';
import { buildOpenAIContext, enrichExplanation } from './explainability/builder';

// ── Query types ───────────────────────────────────────────────────────────────

export interface ForecastQuery {
  commodity:  string;  // raw commodity name (will be normalized)
  market?:    string;
  state?:     string;
  district?:  string;
  horizon?:   number;  // 1–14, default 14
  hooks?:     ExternalFeatureHooks;
}

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const DISCLAIMER =
  'Experimental price estimates based on historical patterns. ' +
  'Not financial advice. Actual mandi prices may differ significantly.';
const CACHE_TTL_MS = 1000 * 60 * 10;

function directionFromForecast(points: { point: number }[], latestPrice: number | null): 'up' | 'down' | 'flat' {
  if (!points.length || !latestPrice) return 'flat';
  const last = points.at(-1)!.point;
  const pct  = (last - latestPrice) / latestPrice * 100;
  return pct > 1 ? 'up' : pct < -1 ? 'down' : 'flat';
}

function trendPct(points: { point: number }[], latestPrice: number | null): number {
  if (!points.length || !latestPrice || latestPrice === 0) return 0;
  return Math.round(((points.at(-1)!.point - latestPrice) / latestPrice) * 10000) / 100;
}

function normalizedEquals(a?: string, b?: string, opts: { stripApmc?: boolean } = {}): boolean {
  if (!a || !b) return false;
  return normalizeLabel(a, opts) === normalizeLabel(b, opts);
}

function normalizedContains(a?: string, b?: string, opts: { stripApmc?: boolean } = {}): boolean {
  if (!a || !b) return false;
  const left = normalizeLabel(a, opts);
  const right = normalizeLabel(b, opts);
  return !!left && !!right && (left.includes(right) || right.includes(left));
}

function scoreSeriesMatch(ts: TimeSeries, query: ForecastQuery): number {
  let score = 0;

  if (query.state) {
    if (normalizedEquals(ts.state, query.state)) score += 4;
    else if (normalizedContains(ts.state, query.state)) score += 2;
    else return -1;
  }

  if (query.district) {
    if (normalizedEquals(ts.district, query.district)) score += 4;
    else if (normalizedContains(ts.district, query.district)) score += 2;
    else return -1;
  }

  if (query.market) {
    if (normalizedEquals(ts.market, query.market, { stripApmc: true })) score += 8;
    else if (normalizedContains(ts.market, query.market, { stripApmc: true })) score += 5;
    else return -1;
  }

  score += Math.min(3, ts.real_count / 30);
  score += Math.min(2, ts.points.length / 60);
  return score;
}

function suggestMatchingMarkets(
  allSeries: TimeSeries[],
  commodity_id: string,
  query: ForecastQuery,
): string[] {
  const matches = allSeries
    .filter((ts) => ts.commodity_id === commodity_id)
    .filter((ts) => !query.state || normalizedContains(ts.state, query.state))
    .map((ts) => ({ market: ts.market, score: query.market ? scoreSeriesMatch(ts, { ...query, district: query.district }) : 0 }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.market);

  return [...new Set(matches)].slice(0, 5);
}

function insufficientResponse(
  commodity: string,
  commodity_id: string,
  market: string,
  mandi_id: string,
  state: string,
  message: string,
): ForecastResponse {
  return {
    commodity, commodity_id, market, mandi_id, state,
    latest_price: null, latest_date: null,
    forecast: [], direction: 'flat', trend_pct: 0,
    model_used: 'none', insufficient: true, message,
    meta: {
      model_type: 'none', model_description: message,
      data_points: 0, real_data_points: 0, has_synthetic_data: false,
      backtest: { mae: null, rmse: null, wape: null, smape: null, directional_accuracy: null, ci_coverage: null, n_test_points: 0 },
      disclaimer: DISCLAIMER,
    },
    explanation: {
      model_family: 'none', model_id: 'none',
      top_features: [], parameters: {},
      recent_error_band: null, anomaly_flags: [],
      data_summary: { n_real_points: 0, date_range: null, has_gaps: false, missing_ratio: 0 },
    },
  };
}

// ── Build state averages (spatial feature) ────────────────────────────────────

function buildStateAverages(
  allSeries: TimeSeries[],
  targetCommodityId: string,
  targetState: string,
): Map<string, number> {
  const sameState = allSeries.filter(
    (ts) => ts.commodity_id === targetCommodityId && ts.state === targetState
  );

  const byDate = new Map<string, number[]>();
  for (const ts of sameState) {
    for (const p of ts.points) {
      if (p.modal_price === null) continue;
      const arr = byDate.get(p.date) ?? [];
      arr.push(p.modal_price);
      byDate.set(p.date, arr);
    }
  }

  const result = new Map<string, number>();
  for (const [date, prices] of byDate) {
    result.set(date, prices.reduce((s, v) => s + v, 0) / prices.length);
  }
  return result;
}

// ── Engine class ──────────────────────────────────────────────────────────────

export class ForecastingEngine {
  private hooks: ExternalFeatureHooks;
  private selectionCache = new Map<string, CacheEntry<ChampionResult>>();

  constructor(opts: { hooks?: ExternalFeatureHooks } = {}) {
    this.hooks = opts.hooks ?? defaultHooks;
  }

  private selectionCacheKey(ts: TimeSeries, horizon: number): string {
    const lastDate = ts.points.at(-1)?.date ?? 'none';
    const lastPrice = ts.points.filter((point) => point.modal_price !== null).at(-1)?.modal_price ?? 'none';
    return [ts.commodity_id, ts.mandi_id, ts.points.length, ts.real_count, ts.imputed_count, lastDate, lastPrice, horizon].join('|');
  }

  private getSelection(ts: TimeSeries, allSeries: TimeSeries[], horizon: number): ChampionResult {
    const key = this.selectionCacheKey(ts, horizon);
    const cached = this.selectionCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const stateAverages = buildStateAverages(allSeries, ts.commodity_id, ts.state);
    const selection = runChampionChallenger(ts, { horizon, stateAverages, hooks: this.hooks });
    this.selectionCache.set(key, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value: selection,
    });
    return selection;
  }

  /** Main forecast endpoint. */
  async forecast(query: ForecastQuery): Promise<ForecastResponse> {
    const commodity_id = normalizeCommodity(query.commodity);
    const horizon      = Math.min(14, Math.max(1, query.horizon ?? 14));

    const { records, fetchedAt } = await loadRecords({ commodity: query.commodity, state: query.state, market: query.market });

    const seriesMap = buildTimeSeries(records, fetchedAt);
    const allSeries = [...seriesMap.values()];

    const ts = findSeries(allSeries, commodity_id, query);

    if (!ts) {
      const suggestions = suggestMatchingMarkets(allSeries, commodity_id, query);
      return insufficientResponse(
        query.commodity, commodity_id,
        query.market ?? 'All', '',
        query.state  ?? 'All India',
        suggestions.length
          ? `No exact data match found for ${query.commodity} in the selected location. Closest available markets: ${suggestions.join(', ')}.`
          : `No data found for ${query.commodity} in the selected location.`,
      );
    }

    const nonNull = ts.points.filter((p) => p.modal_price !== null);
    if (nonNull.length < 7) {
      return insufficientResponse(
        displayName(commodity_id), commodity_id,
        ts.market, ts.mandi_id, ts.state,
        `Insufficient data — only ${nonNull.length} daily records found. Need at least 7.`,
      );
    }

    const result = this.getSelection(ts, allSeries, horizon);
    const champion = getChampionForecast(result);

    if (!champion) {
      return insufficientResponse(
        displayName(commodity_id), commodity_id,
        ts.market, ts.mandi_id, ts.state,
        'No model could fit the available data.',
      );
    }

    const latestPrice = nonNull.at(-1)?.modal_price ?? null;
    const latestDate  = nonNull.at(-1)?.date ?? null;
    const enrichedExpl = enrichExplanation(champion.explanation, ts, champion.metrics, latestPrice);

    const history_series = nonNull
      .slice(-30)
      .map((p) => ({ date: p.date, price: p.modal_price as number }));

    const meta: ForecastMeta = {
      model_type:        champion.modelId,
      model_description: enrichedExpl.model_family,
      data_points:       ts.points.length,
      real_data_points:  ts.real_count,
      has_synthetic_data: ts.imputed_count > 0,
      backtest:          champion.metrics,
      disclaimer:        DISCLAIMER,
    };

    return {
      commodity:    displayName(commodity_id),
      commodity_id,
      market:       ts.market,
      mandi_id:     ts.mandi_id,
      state:        ts.state,
      latest_price: latestPrice,
      latest_date:  latestDate,
      forecast:     champion.points,
      history_series,
      direction:    directionFromForecast(champion.points, latestPrice),
      trend_pct:    trendPct(champion.points, latestPrice),
      model_used:   champion.modelId,
      insufficient: false,
      meta,
      explanation:  enrichedExpl,
    };
  }

  /** Compare all models side by side. */
  async compare(query: ForecastQuery): Promise<CompareResponse> {
    const commodity_id = normalizeCommodity(query.commodity);
    const horizon      = Math.min(14, Math.max(1, query.horizon ?? 14));

    const { records, fetchedAt } = await loadRecords({ commodity: query.commodity, state: query.state, market: query.market });
    const seriesMap = buildTimeSeries(records, fetchedAt);
    const allSeries = [...seriesMap.values()];

    const ts = findSeries(allSeries, commodity_id, query);
    if (!ts) {
      return { commodity: query.commodity, market: query.market ?? 'All', state: query.state ?? 'All India', champion_id: 'none', models: [] };
    }

    const result = this.getSelection(ts, allSeries, horizon);

    return {
      commodity: displayName(commodity_id),
      market:    ts.market,
      state:     ts.state,
      champion_id: result.champion_id,
      models: result.models.map((m) => ({
        modelId:    m.modelId,
        forecast:   m.points,
        metrics:    m.metrics,
        is_champion: m.is_champion,
      })),
    };
  }

  /** Data quality report. */
  async quality(query: ForecastQuery): Promise<QualityResponse> {
    const commodity_id = normalizeCommodity(query.commodity);
    const { records, fetchedAt } = await loadRecords({ commodity: query.commodity, state: query.state, market: query.market });
    const seriesMap = buildTimeSeries(records, fetchedAt);
    const allSeries = [...seriesMap.values()];

    const ts = findSeries(allSeries, commodity_id, query);

    const qflags = ts?.points.map((p) => p.quality) ?? [];
    const qSummary = summarizeQuality(qflags);
    const totalDays = qflags.length;
    const realDays  = ts ? ts.real_count : 0;
    const dates     = ts?.points.map((p) => p.date) ?? [];
    const warnings: string[] = [];

    if (ts && ts.imputed_count / totalDays > 0.3) warnings.push(`High imputation ratio: ${(ts.imputed_count / totalDays * 100).toFixed(0)}%`);
    if (qSummary.stale_days / totalDays > 0.2) warnings.push(`High stale rate: ${(qSummary.stale_days / totalDays * 100).toFixed(0)}% of days had identical prices`);
    if (qSummary.outlier_days > 5) warnings.push(`${qSummary.outlier_days} outlier days detected and clipped`);
    if (ts && ts.freshness === 'stale') warnings.push('Data may be stale — latest snapshot is > 36h old');

    // Backtest all eligible models
    const backtest_by_model: Record<string, import('./schema/types').BacktestMetrics> = {};
    if (ts && ts.real_count >= 7) {
      const horizon = 14;
      const result = this.getSelection(ts, allSeries, horizon);
      for (const m of result.models) {
        backtest_by_model[m.modelId] = m.metrics;
      }
    }

    return {
      commodity: displayName(commodity_id),
      market:    ts?.market ?? query.market ?? 'All',
      state:     ts?.state  ?? query.state  ?? 'All India',
      data_quality: {
        total_days:    totalDays,
        real_days:     realDays,
        missing_days:  totalDays - realDays,
        outlier_days:  qSummary.outlier_days,
        stale_days:    qSummary.stale_days,
        zero_days:     qSummary.zero_days,
        imputed_days:  qSummary.imputed_days,
        missing_ratio: totalDays > 0 ? Math.round(((totalDays - realDays) / totalDays) * 1000) / 1000 : 0,
        date_range:    dates.length >= 2 ? [dates[0], dates.at(-1)!] : null,
      },
      backtest_by_model,
      recommended_model: Object.entries(backtest_by_model)
        .sort(([, a], [, b]) => (a.smape ?? Infinity) - (b.smape ?? Infinity))[0]?.[0] ?? 'none',
      warnings,
    };
  }

  /** Drivers / explanation endpoint (for AI narration). */
  async drivers(query: ForecastQuery): Promise<DriversResponse> {
    const res = await this.forecast(query);
    const commodity_id = normalizeCommodity(query.commodity);
    const horizon = Math.min(14, Math.max(1, query.horizon ?? 14));
    const { records, fetchedAt } = await loadRecords({ commodity: query.commodity, state: query.state, market: query.market });
    const seriesMap = buildTimeSeries(records, fetchedAt);
    const allSeries = [...seriesMap.values()];
    const ts = findSeries(allSeries, commodity_id, query);
    const selection = ts ? this.getSelection(ts, allSeries, horizon) : null;
    const champion = selection ? getChampionForecast(selection) : null;
    const openai_context = ts && champion
      ? buildOpenAIContext(ts, champion, res.latest_price)
      : {
          model_family: res.explanation.model_family,
          recent_history_summary: 'No detailed history available.',
          forecast_summary: `${res.forecast.length}-day forecast, direction: ${res.direction}`,
          top_feature_narrative: res.explanation.top_features.map((feature) => feature.feature_name).join(', ') || res.explanation.model_family,
          anomalies_narrative: res.explanation.anomaly_flags.map((flag) => flag.description).join('; ') || 'none',
          confidence_note: `sMAPE: ${res.meta.backtest.smape ?? '–'}%, RMSE: ${res.meta.backtest.rmse ?? '–'}`,
          data_note: `${res.meta.real_data_points} real data points${res.meta.has_synthetic_data ? ' with interpolation' : ''}`,
        };

    return {
      commodity:         res.commodity,
      market:            res.market,
      state:             res.state,
      model_used:        res.model_used,
      top_features:      res.explanation.top_features,
      anomaly_flags:     res.explanation.anomaly_flags,
      recent_error_band: res.explanation.recent_error_band,
      openai_context,
    };
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function findSeries(
  allSeries: TimeSeries[],
  commodity_id: string,
  query: ForecastQuery,
): TimeSeries | null {
  const commodityCandidates = allSeries.filter((ts) => ts.commodity_id === commodity_id);
  if (!commodityCandidates.length) return null;

  if (!query.market && !query.district) {
    const stateCandidates = commodityCandidates.filter((ts) => !query.state || normalizedContains(ts.state, query.state));
    if (!stateCandidates.length) return null;
    if (stateCandidates.length === 1) return stateCandidates[0];
    return aggregateVirtualSeries(stateCandidates, commodity_id, query.state ?? 'All India');
  }

  const scored = commodityCandidates
    .map((ts) => ({ ts, score: scoreSeriesMatch(ts, query) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.ts ?? null;
}

/**
 * Aggregate multiple per-mandi series into one virtual series by date-averaging.
 * Used when no specific market filter is applied.
 */
function aggregateVirtualSeries(
  series: TimeSeries[],
  commodity_id: string,
  state: string,
): TimeSeries {
  const byDate = new Map<string, number[]>();
  for (const ts of series) {
    for (const p of ts.points) {
      if (p.modal_price === null) continue;
      const arr = byDate.get(p.date) ?? [];
      arr.push(p.modal_price);
      byDate.set(p.date, arr);
    }
  }

  const dates = [...byDate.keys()].sort();
  const points = dates.map((date) => {
    const prices = byDate.get(date)!;
    const avg = prices.reduce((s, v) => s + v, 0) / prices.length;
    return {
      date,
      commodity_id,
      mandi_id: `__aggregate__${commodity_id}__${state}`,
      state,
      district: '',
      market:   'All Markets',
      modal_price: Math.round(avg * 100) / 100,
      min_price: null,
      max_price: null,
      arrivals: null,
      source: 'agmarknet' as const,
      freshness_hours: 0,
      quality: {
        is_zero: false, is_stale: false, is_outlier: false,
        is_imputed: false, is_price_gap: false, outlier_zscore: null,
      },
    };
  });

  return {
    commodity_id,
    commodity: displayName(commodity_id),
    mandi_id: `__aggregate__${commodity_id}__${state}`,
    state,
    district: '',
    market: 'All Markets',
    points,
    freshness: 'live',
    real_count: points.length,
    imputed_count: 0,
  };
}

// Singleton (can be replaced with dependency injection in production)
export const forecastingEngine = new ForecastingEngine();
