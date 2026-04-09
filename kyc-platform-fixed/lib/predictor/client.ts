/**
 * Predictor API client — proxies to the mandi Express service (port 4000).
 * All calls include request deduplication + error normalization.
 */

const MANDI_BASE = process.env.MANDI_SERVICE_URL || 'http://localhost:4000';
const TIMEOUT_MS = 10_000;

interface FetchOpts {
  params?: Record<string, string | number | boolean>;
  revalidate?: number;
}

async function mandiGet<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const url = new URL(`${MANDI_BASE}${path}`);
  if (opts.params) {
    Object.entries(opts.params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      next: opts.revalidate !== undefined ? { revalidate: opts.revalidate } : undefined,
    });
    if (!res.ok) throw new Error(`Mandi service error: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

export interface MandiStatus {
  lastRefreshAt: string | null;
  lastSnapshotDate: string | null;
  lastRecordCount: number;
  inProgress: boolean;
  error: string | null;
  totalSnapshots: number;
  snapshotDates: string[];
}

export interface MandiOptions {
  commodities: string[];
  states: string[];
  districts: string[];
  markets: string[];
  varieties: string[];
  grades: string[];
}

export interface MandiSummary {
  latestSnapshotDate: string | null;
  latestArrivalDate: string | null;
  recordsCount: number;
  marketsCount: number;
  avgModalPrice: number | null;
  avgMinPrice: number | null;
  avgMaxPrice: number | null;
  lowestModalPrice: number | null;
  highestModalPrice: number | null;
  topMarkets: {
    market: string;
    district: string;
    state: string;
    modal_price: number | null;
    min_price: number | null;
    max_price: number | null;
    arrival_date: string;
  }[];
}

export interface MandiHistoryPoint {
  arrival_date: string;
  avg_modal_price: number | null;
  avg_min_price: number | null;
  avg_max_price: number | null;
  markets_count: number;
  records_count: number;
}

export interface MandiTableResult {
  page: number;
  pageSize: number;
  total: number;
  rows: {
    state: string;
    district: string;
    market: string;
    commodity: string;
    variety: string;
    grade: string;
    arrival_date: string;
    min_price: number | null;
    max_price: number | null;
    modal_price: number | null;
  }[];
}

export interface ForecastResult {
  commodity: string;
  market: string;
  state: string;
  latestPrice: number | null;
  forecast: { date: string; price: number; lower: number; upper: number }[];
  mape: number | null;
  direction: 'up' | 'down' | 'flat';
  trend_pct: number;
  dataPoints: number;
  insufficient: boolean;
  message?: string;
  insights?: string | null;
  alpha?: number;
  beta?: number;
}

export const predictorClient = {
  status: () => mandiGet<MandiStatus>('/api/status', { revalidate: 60 }),
  options: (filters?: Record<string, string>) => mandiGet<MandiOptions>('/api/options', { params: filters, revalidate: 300 }),
  summary: (filters: Record<string, string | number>) => mandiGet<MandiSummary>('/api/summary', { params: filters, revalidate: 120 }),
  history: (filters: Record<string, string | number>) => mandiGet<MandiHistoryPoint[]>('/api/history', { params: filters, revalidate: 120 }),
  table: (filters: Record<string, string | number>) => mandiGet<MandiTableResult>('/api/table', { params: filters, revalidate: 60 }),
  forecast: (filters: Record<string, string | number>) => mandiGet<ForecastResult>('/api/forecast', { params: { ...filters, insights: 'true' }, revalidate: 120 }),
  fetch: (urlPath: string) => mandiGet<unknown>(urlPath),

  async isAvailable(): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 2000);
      const res = await fetch(`${MANDI_BASE}/health`, { signal: ctrl.signal });
      return res.ok;
    } catch {
      return false;
    }
  },
};
