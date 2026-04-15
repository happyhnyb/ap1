import { getHistoricalRecords, filterRecords, buildHistory, holtForecast, rollingBacktest, type MandiFilters } from '@/lib/mandi/engine';
import type { DriversResponse, ForecastResponse, QualityResponse } from './schema/types';
import { normalizeCommodity } from './schema/commodity';
import seedSeries from './data/seed-series.json';

const CACHE_TTL_MS = 1000 * 60 * 10;
const FALLBACK_DAYS = 21;

type CachedSeries = {
  fetchedAt: string;
  filters: MandiFilters;
  history: ReturnType<typeof buildHistory>;
  prices: number[];
};

type SeedRow = {
  c: string;
  s: string;
  dist: string;
  m: string;
  d: string;
  modal: number;
  min: number | null;
  max: number | null;
  arrivals: number | null;
};

const seriesCache = new Map<string, { expiresAt: number; value: CachedSeries }>();

function cacheKey(filters: MandiFilters) {
  return JSON.stringify(filters);
}

function sameFilter(actual: string, expected: string) {
  return !expected || actual.trim().toLowerCase() === expected.trim().toLowerCase();
}

function loadSeedSeries(filters: MandiFilters): CachedSeries | null {
  const commodity = normalizeCommodity(filters.commodity);
  const rows = (seedSeries.rows as SeedRow[]).filter((row) =>
    row.c === commodity
    && sameFilter(row.s, filters.state)
    && sameFilter(row.dist, filters.district)
    && sameFilter(row.m, filters.market)
  );

  if (!rows.length) return null;

  const records = rows.map((row) => ({
    state: row.s,
    district: row.dist,
    market: row.m,
    commodity,
    variety: '',
    grade: '',
    arrival_date: row.d,
    min_price: row.min,
    max_price: row.max,
    modal_price: row.modal,
    arrivals: row.arrivals,
  }));
  const history = buildHistory(records);
  const prices = history
    .filter((row) => typeof row.avg_modal_price === 'number')
    .map((row) => row.avg_modal_price as number);

  return {
    fetchedAt: `${seedSeries.to}T00:00:00.000Z`,
    filters,
    history,
    prices,
  };
}

async function loadSeries(filters: MandiFilters): Promise<CachedSeries> {
  const key = cacheKey(filters);
  const now = Date.now();
  const cached = seriesCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const seeded = loadSeedSeries(filters);
  if (seeded) {
    seriesCache.set(key, { expiresAt: now + CACHE_TTL_MS, value: seeded });
    return seeded;
  }

  const { records, fetchedAt } = await getHistoricalRecords(filters, FALLBACK_DAYS);
  const filtered = filterRecords(records, filters);
  const history = buildHistory(filtered);
  const prices = history
    .filter((row) => typeof row.avg_modal_price === 'number')
    .map((row) => row.avg_modal_price as number);

  const value = { fetchedAt, filters, history, prices };
  seriesCache.set(key, { expiresAt: now + CACHE_TTL_MS, value });
  return value;
}

export async function fallbackForecastResponse(input: {
  commodity: string;
  state?: string;
  market?: string;
  district?: string;
  horizon: number;
}): Promise<ForecastResponse> {
  const filters: MandiFilters = {
    commodity: input.commodity,
    state: input.state ?? '',
    market: input.market ?? '',
    district: input.district ?? '',
    variety: '',
    grade: '',
  };

  const { history, prices, fetchedAt } = await loadSeries(filters);
  const market = input.market || 'All';
  const state = input.state || 'All India';

  if (prices.length < 7) {
    return {
      commodity: input.commodity,
      commodity_id: input.commodity.toLowerCase().replace(/\s+/g, '-'),
      market,
      mandi_id: [market, input.district || '', state].join('|').toLowerCase(),
      state,
      latest_price: prices.at(-1) ?? null,
      latest_date: history.at(-1)?.arrival_date ?? null,
      forecast: [],
      direction: 'flat',
      trend_pct: 0,
      model_used: 'holt_fallback',
      insufficient: true,
      message: 'Insufficient multi-day market history for this selection. Try a broader market filter or a major mandi.',
      meta: {
        model_type: 'holt_fallback',
        model_description: 'Fast fallback forecast based on recent government mandi history.',
        data_points: prices.length,
        real_data_points: prices.length,
        has_synthetic_data: false,
        backtest: {
          mae: null,
          wape: null,
          smape: null,
          directional_accuracy: null,
          ci_coverage: null,
          n_test_points: 0,
        },
        disclaimer: `Fallback mode using ${prices.length} daily points. Last fetched: ${fetchedAt.slice(0, 10)}.`,
      },
      explanation: {
        model_family: 'Fast fallback Holt forecast',
        model_id: 'holt_fallback',
        top_features: [],
        parameters: {},
        recent_error_band: null,
        anomaly_flags: [],
        data_summary: {
          n_real_points: prices.length,
          date_range: history.length ? [history[0].arrival_date, history.at(-1)!.arrival_date] : null,
          has_gaps: false,
          missing_ratio: 0,
        },
      },
    };
  }

  const result = holtForecast(prices, input.horizon);
  const backtest = rollingBacktest(prices);
  const latestPrice = prices.at(-1) ?? null;

  if (!result) {
    throw new Error('Fallback forecast unavailable.');
  }

  return {
    commodity: input.commodity,
    commodity_id: input.commodity.toLowerCase().replace(/\s+/g, '-'),
    market,
    mandi_id: [market, input.district || '', state].join('|').toLowerCase(),
    state,
    latest_price: latestPrice,
    latest_date: history.at(-1)?.arrival_date ?? null,
    forecast: result.forecast.map((point, index) => ({
      date: point.date,
      horizon_days: index + 1,
      point: point.price,
      lower: point.lower,
      upper: point.upper,
    })),
    direction: result.direction as 'up' | 'down' | 'flat',
    trend_pct: result.trend_pct,
    model_used: 'holt_fallback',
    insufficient: false,
    meta: {
      model_type: 'holt_fallback',
      model_description: 'Fast fallback double exponential smoothing on recent government mandi history.',
      data_points: prices.length,
      real_data_points: prices.length,
      has_synthetic_data: false,
      backtest: {
        mae: backtest.mae,
        wape: null,
        smape: backtest.smape,
        directional_accuracy: null,
        ci_coverage: null,
        n_test_points: prices.length >= 14 ? Math.min(14, prices.length - 7) : 0,
      },
      disclaimer: `Fallback mode using ${prices.length} daily points. Last fetched: ${fetchedAt.slice(0, 10)}.`,
    },
    explanation: {
      model_family: 'Fast fallback Holt forecast',
      model_id: 'holt_fallback',
      top_features: [
        { feature_name: 'recent_trend', importance: 0.5, direction: result.direction === 'up' ? 'positive' : result.direction === 'down' ? 'negative' : 'mixed' },
        { feature_name: '7_day_average', importance: 0.3, direction: 'mixed' },
        { feature_name: 'short_history_window', importance: 0.2, direction: 'mixed' },
      ],
      parameters: { alpha: result.alpha, beta: result.beta },
      recent_error_band: result.mape,
      anomaly_flags: [],
      data_summary: {
        n_real_points: prices.length,
        date_range: history.length ? [history[0].arrival_date, history.at(-1)!.arrival_date] : null,
        has_gaps: false,
        missing_ratio: 0,
      },
    },
  };
}

export async function fallbackQualityResponse(input: {
  commodity: string;
  state?: string;
  market?: string;
  district?: string;
}): Promise<QualityResponse> {
  const filters: MandiFilters = {
    commodity: input.commodity,
    state: input.state ?? '',
    market: input.market ?? '',
    district: input.district ?? '',
    variety: '',
    grade: '',
  };
  const { history, prices } = await loadSeries(filters);
  const missingDays = Math.max(0, FALLBACK_DAYS - history.length);
  const backtest = rollingBacktest(prices);

  return {
    commodity: input.commodity,
    market: input.market || 'All',
    state: input.state || 'All India',
    data_quality: {
      total_days: history.length,
      real_days: prices.length,
      missing_days: missingDays,
      outlier_days: 0,
      stale_days: 0,
      zero_days: prices.filter((price) => price === 0).length,
      imputed_days: 0,
      missing_ratio: history.length ? missingDays / Math.max(history.length + missingDays, 1) : 1,
      date_range: history.length ? [history[0].arrival_date, history.at(-1)!.arrival_date] : null,
    },
    backtest_by_model: {
      holt_fallback: {
        mae: backtest.mae,
        wape: null,
        smape: backtest.smape,
        directional_accuracy: null,
        ci_coverage: null,
        n_test_points: prices.length >= 14 ? Math.min(14, prices.length - 7) : 0,
      },
    },
    recommended_model: 'holt_fallback',
    warnings: prices.length < 7 ? ['Limited recent history available for this selection.'] : [],
  };
}

export async function fallbackDriversResponse(input: {
  commodity: string;
  state?: string;
  market?: string;
  district?: string;
  horizon: number;
}): Promise<DriversResponse> {
  const forecast = await fallbackForecastResponse(input);
  return {
    commodity: forecast.commodity,
    market: forecast.market,
    state: forecast.state,
    model_used: forecast.model_used,
    top_features: forecast.explanation.top_features,
    anomaly_flags: forecast.explanation.anomaly_flags,
    recent_error_band: forecast.explanation.recent_error_band,
    openai_context: {
      model_family: forecast.explanation.model_family,
      recent_history_summary: `Recent daily history window length: ${forecast.explanation.data_summary.n_real_points} points.`,
      forecast_summary: `${forecast.direction} trend over ${input.horizon} days with ${forecast.trend_pct.toFixed(1)}% projected move.`,
      top_feature_narrative: forecast.explanation.top_features.map((item) => item.feature_name).join(', '),
      anomalies_narrative: forecast.explanation.anomaly_flags.length ? forecast.explanation.anomaly_flags.map((item) => item.description).join(' ') : 'No major anomalies flagged in fallback mode.',
      confidence_note: forecast.explanation.recent_error_band != null ? `Recent error band is about ${forecast.explanation.recent_error_band.toFixed(1)}%.` : 'Confidence is constrained by limited recent history.',
      data_note: `Fallback forecast built from recent Agmarknet history for ${forecast.market}, ${forecast.state}.`,
    },
  };
}
