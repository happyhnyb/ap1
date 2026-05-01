import { buildSeedOptions, buildSeedSummary, getSeedRecords } from '@/lib/forecasting/data/seed';
import { fallbackForecastResponse } from '@/lib/forecasting/fallback';
import { loadRecords } from '@/lib/forecasting/data/loader';
import { forecastingEngine } from '@/lib/forecasting/engine';
import { buildOptions, buildSummary, filterRecords } from '@/lib/mandi/engine';

type SearchParamValue = string | string[] | undefined;

export type PredictorSearchParams = Record<string, SearchParamValue>;

export interface PredictorFilterOptions {
  commodities: string[];
  states: string[];
  districts: string[];
  markets: string[];
  districtsByState: Record<string, string[]>;
  marketsByState: Record<string, string[]>;
  marketsByDistrict: Record<string, string[]>;
}

export interface PredictorPageData {
  options: PredictorFilterOptions;
  current: {
    commodity: string;
    state: string;
    district: string;
    market: string;
    horizon: number;
  };
  summary: ReturnType<typeof buildSummary>;
  marketRows: Array<{
    market: string;
    state: string;
    district: string;
    modal_price: number | null;
    min_price: number | null;
    max_price: number | null;
  }>;
  forecast: Awaited<ReturnType<typeof forecastingEngine.forecast>>;
  quality: {
    commodity: string;
    market: string;
    state: string;
    data_quality: {
      missing_ratio: number;
      real_days: number;
      stale_days: number;
      missing_days: number;
      outlier_days: number;
      date_range: [string, string] | null;
    };
  };
  drivers: {
    top_features: Awaited<ReturnType<typeof forecastingEngine.forecast>>['explanation']['top_features'];
    recent_error_band: Awaited<ReturnType<typeof forecastingEngine.forecast>>['explanation']['recent_error_band'];
  };
  recordsCount: number;
  hasNoRecords: boolean;
  dataWarning: string | null;
  source: 'snapshots' | 'mongodb' | 'agmarknet' | 'seed' | 'hybrid';
  sourceFetchedAt: string | null;
}

function first(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function buildMarketRows(records: Array<{
  market: string;
  state: string;
  district: string;
  modal_price: number | null;
  min_price: number | null;
  max_price: number | null;
}>) {
  const map = new Map<string, { modal: number[]; min: number[]; max: number[]; state: string; district: string }>();
  for (const record of records) {
    const key = record.market || 'Unknown';
    const existing = map.get(key) ?? { modal: [], min: [], max: [], state: record.state, district: record.district };
    if (typeof record.modal_price === 'number') existing.modal.push(record.modal_price);
    if (typeof record.min_price === 'number') existing.min.push(record.min_price);
    if (typeof record.max_price === 'number') existing.max.push(record.max_price);
    map.set(key, existing);
  }

  const average = (values: number[]) => values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;

  return [...map.entries()]
    .map(([market, row]) => ({
      market,
      state: row.state,
      district: row.district,
      modal_price: average(row.modal),
      min_price: average(row.min),
      max_price: average(row.max),
    }))
    .filter((row) => row.modal_price !== null)
    .sort((a, b) => (b.modal_price ?? 0) - (a.modal_price ?? 0))
    .slice(0, 20);
}

function normalizeFilterOptions(options: ReturnType<typeof buildOptions> | ReturnType<typeof buildSeedOptions>): PredictorFilterOptions {
  return {
    commodities: options.commodities,
    states: options.states,
    districts: options.districts,
    markets: options.markets,
    districtsByState: options.districtsByState,
    marketsByState: options.marketsByState,
    marketsByDistrict: options.marketsByDistrict ?? {},
  };
}

export async function getPredictorPageData(params: PredictorSearchParams = {}): Promise<PredictorPageData> {
  let liveRecordsAll: Awaited<ReturnType<typeof loadRecords>> | null = null;
  try {
    liveRecordsAll = await loadRecords();
  } catch {
    liveRecordsAll = null;
  }

  const seedOptions = buildSeedOptions();
  const liveOptions = liveRecordsAll?.records.length ? buildOptions(liveRecordsAll.records) : null;
  const resolvedOptions = (liveOptions?.commodities.length ?? 0) > 0 ? liveOptions! : seedOptions;
  const options = normalizeFilterOptions(resolvedOptions);

  const preferredCommodity = options.commodities.includes('Wheat')
    ? 'Wheat'
    : options.commodities[0] ?? '';

  const reqCommodity = first(params.commodity)?.trim();
  const reqState = first(params.state)?.trim();
  const reqDistrict = first(params.district)?.trim() || first(params.city)?.trim();
  const reqMarket = first(params.market)?.trim();
  const reqHorizon = Number.parseInt(first(params.horizon) ?? '', 10);

  const commodity = reqCommodity && options.commodities.includes(reqCommodity)
    ? reqCommodity
    : preferredCommodity;
  const state = reqState && options.states.includes(reqState)
    ? reqState
    : '';

  const validDistricts = state ? (options.districtsByState[state] ?? []) : [];
  const district = reqDistrict && validDistricts.includes(reqDistrict) ? reqDistrict : '';

  const marketScopeKey = district ? `${state}::${district}` : '';
  const validMarkets = district
    ? (options.marketsByDistrict[marketScopeKey] ?? [])
    : state
      ? (options.marketsByState[state] ?? [])
      : [];
  const market = reqMarket && validMarkets.includes(reqMarket) ? reqMarket : '';
  const horizon = Number.isFinite(reqHorizon) ? Math.min(14, Math.max(3, reqHorizon)) : 14;

  const liveFilter = { commodity, state, district, market, variety: '', grade: '' };
  const liveRecords = liveRecordsAll?.records.length ? filterRecords(liveRecordsAll.records, liveFilter) : [];
  const seedRecords = getSeedRecords({
    commodity,
    state,
    district: district || undefined,
    market: market || undefined,
  });
  const recordsForView = liveRecords.length ? liveRecords : seedRecords;
  const summary = liveRecords.length
    ? buildSummary(liveRecords, liveRecordsAll?.fetchedAt ?? null)
    : buildSeedSummary({
        commodity,
        state,
        district: district || undefined,
        market: market || undefined,
      });

  const forecast = await forecastingEngine
    .forecast({
      commodity,
      state: state || undefined,
      district: district || undefined,
      market: market || undefined,
      horizon,
    })
    .catch(() => fallbackForecastResponse({
      commodity,
      state: state || undefined,
      district: district || undefined,
      market: market || undefined,
      horizon,
    }));

  const dataPoints = forecast.meta.data_points;
  const usingFallbackData = !liveRecords.length;
  const isSeedOnly = liveRecordsAll?.source === 'seed' || !liveRecordsAll;
  const dataWarning = usingFallbackData
    ? isSeedOnly
      ? 'Live Agmarknet data was unavailable, so this view is using cached fallback data.'
      : 'This selection had no current live rows, so cached fallback data is shown.'
    : null;

  console.info('[predictor.page-data]', {
    commodity,
    state,
    district,
    market,
    horizon,
    source: liveRecordsAll?.source ?? 'seed',
    sourceFetchedAt: liveRecordsAll?.fetchedAt ?? null,
    liveRecords: liveRecords.length,
    viewRecords: recordsForView.length,
    forecastPoints: dataPoints,
  });

  return {
    options,
    current: { commodity, state, district, market, horizon },
    summary,
    marketRows: buildMarketRows(recordsForView),
    forecast,
    quality: {
      commodity,
      market: market || 'All',
      state: state || 'All states',
      data_quality: {
        missing_ratio: dataPoints > 0
          ? Math.max(0, (dataPoints - forecast.meta.real_data_points) / dataPoints)
          : 1,
        real_days: forecast.meta.real_data_points,
        stale_days: 0,
        missing_days: Math.max(0, dataPoints - forecast.meta.real_data_points),
        outlier_days: forecast.explanation.anomaly_flags.filter((flag) => flag.type === 'outlier').length,
        date_range: forecast.history_series?.length
          ? [forecast.history_series[0].date, forecast.history_series.at(-1)!.date] as [string, string]
          : null,
      },
    },
    drivers: {
      top_features: forecast.explanation.top_features,
      recent_error_band: forecast.explanation.recent_error_band,
    },
    recordsCount: recordsForView.length,
    hasNoRecords: recordsForView.length === 0,
    dataWarning,
    source: liveRecordsAll?.source ?? 'seed',
    sourceFetchedAt: liveRecordsAll?.fetchedAt ?? null,
  };
}
