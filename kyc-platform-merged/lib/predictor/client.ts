/**
 * Predictor API client — proxies requests to the mandi Express service.
 *
 * Model type: Adaptive Holt's Double Exponential Smoothing (trend extrapolation).
 * This is NOT machine learning. See lib/predictor/types.ts for full disclosure.
 */
import type {
  MandiStatus,
  MandiOptions,
  MandiSummary,
  MandiHistoryPoint,
  MandiTableResult,
  ForecastResult,
  InsightsResult,
} from './types';

// Re-export types so callers only need one import
export type {
  MandiStatus, MandiOptions, MandiSummary, MandiHistoryPoint,
  MandiTableResult, ForecastResult, InsightsResult, ForecastMeta,
  ForecastPoint, PriceInsights,
} from './types';

const MANDI_BASE  = process.env.MANDI_SERVICE_URL ?? 'http://localhost:4000';
const TIMEOUT_MS  = 12_000;

interface FetchOpts {
  params?:     Record<string, string | number | boolean>;
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
      next:   opts.revalidate !== undefined ? { revalidate: opts.revalidate } : undefined,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Mandi service responded ${res.status}: ${body.slice(0, 120)}`);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

export const predictorClient = {
  status:   ()                                         => mandiGet<MandiStatus>('/api/status',  { revalidate: 60 }),
  options:  (filters?: Record<string, string>)         => mandiGet<MandiOptions>('/api/options', { params: filters, revalidate: 300 }),
  summary:  (filters: Record<string, string | number>) => mandiGet<MandiSummary>('/api/summary', { params: filters, revalidate: 120 }),
  history:  (filters: Record<string, string | number>) => mandiGet<MandiHistoryPoint[]>('/api/history', { params: filters, revalidate: 120 }),
  table:    (filters: Record<string, string | number>) => mandiGet<MandiTableResult>('/api/table',  { params: filters, revalidate: 60 }),
  forecast: (filters: Record<string, string | number>) => mandiGet<ForecastResult>('/api/forecast', { params: filters, revalidate: 120 }),
  insights: (filters: Record<string, string>)          => mandiGet<InsightsResult>('/api/insights', { params: filters, revalidate: 300 }),

  async isAvailable(): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch(`${MANDI_BASE}/health`, { signal: ctrl.signal });
      return res.ok;
    } catch {
      return false;
    }
  },
};
