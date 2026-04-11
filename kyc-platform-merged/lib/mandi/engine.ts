/**
 * Mandi data engine — runs entirely within Next.js (no separate service).
 *
 * Fetches commodity price data from data.gov.in (Agmarknet resource) and
 * processes it using Adaptive Holt's Double Exponential Smoothing for
 * price trend forecasting.
 *
 * Data is cached for 24 hours via Next.js unstable_cache.
 */

import { unstable_cache } from 'next/cache';
import type {
  MandiRecord,
  MandiHistoryPoint,
  HoltResult,
  BacktestResult,
  MandiFilters,
} from './types';

export type { MandiRecord, MandiHistoryPoint, MandiFilters };

// ── Constants ────────────────────────────────────────────────────────────────

const RESOURCE_ID = '9ef84268-d588-465a-a308-a864a43d0070';
const BASE_URL    = `https://api.data.gov.in/resource/${RESOURCE_ID}`;
const FETCH_LIMIT = 500;

// ── Utilities ─────────────────────────────────────────────────────────────────

function parseNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function slug(v = '') { return String(v || '').trim().toLowerCase(); }

/** Convert Agmarknet dd/mm/yyyy OR already-ISO yyyy-mm-dd → yyyy-mm-dd */
function parseToIso(dateStr: string): string {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const parts = dateStr.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

function safeAverage(values: number[]): number | null {
  const clean = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  return clean.length
    ? Number((clean.reduce((s, v) => s + v, 0) / clean.length).toFixed(2))
    : null;
}

// ── Raw record normalisation ──────────────────────────────────────────────────

function normaliseRecord(r: Record<string, unknown>): MandiRecord {
  return {
    state:        String(r.state        || ''),
    district:     String(r.district     || ''),
    market:       String(r.market       || ''),
    commodity:    String(r.commodity    || ''),
    variety:      String(r.variety      || ''),
    grade:        String(r.grade        || ''),
    arrival_date: parseToIso(String(r.arrival_date || '')),
    min_price:    parseNumber(r.min_price),
    max_price:    parseNumber(r.max_price),
    modal_price:  parseNumber(r.modal_price),
  };
}

function recordKey(r: MandiRecord): string {
  return [r.state, r.district, r.market, r.commodity, r.variety, r.grade,
    r.arrival_date, r.min_price, r.max_price, r.modal_price].join('||');
}

// ── Filtering ─────────────────────────────────────────────────────────────────

export function filterRecords(records: MandiRecord[], filters: MandiFilters): MandiRecord[] {
  return records.filter((r) =>
    (!filters.commodity || slug(r.commodity) === slug(filters.commodity)) &&
    (!filters.state     || slug(r.state)     === slug(filters.state))     &&
    (!filters.district  || slug(r.district)  === slug(filters.district))  &&
    (!filters.market    || slug(r.market)    === slug(filters.market))    &&
    (!filters.variety   || slug(r.variety)   === slug(filters.variety))   &&
    (!filters.grade     || slug(r.grade)     === slug(filters.grade))
  );
}

export function filtersFromQuery(q: Record<string, string>): MandiFilters {
  return {
    commodity: q.commodity || '',
    state:     q.state     || '',
    district:  q.district  || '',
    market:    q.market    || '',
    variety:   q.variety   || '',
    grade:     q.grade     || '',
  };
}

// ── API fetch ─────────────────────────────────────────────────────────────────

async function fetchPage(apiKey: string, offset: number): Promise<Record<string, unknown>[]> {
  const url = new URL(BASE_URL);
  url.searchParams.set('api-key', apiKey);
  url.searchParams.set('format',  'json');
  url.searchParams.set('limit',   String(FETCH_LIMIT));
  url.searchParams.set('offset',  String(offset));

  let lastErr: Error = new Error('fetch failed');
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        // No next.revalidate here — caching is done at the getCachedRecords level
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 4) throw new Error(`API ${res.status}`);
        await new Promise((r) => setTimeout(r, attempt * 2000));
        continue;
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`API ${res.status}: ${t.slice(0, 120)}`);
      }
      const data = await res.json() as { total?: number; records?: Record<string, unknown>[] };
      return data.records ?? [];
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (attempt < 4) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  throw lastErr;
}

async function fetchAllRecords(apiKey: string): Promise<MandiRecord[]> {
  if (!apiKey) throw new Error('DATAGOV_API_KEY is not configured');

  const url = new URL(BASE_URL);
  url.searchParams.set('api-key', apiKey);
  url.searchParams.set('format',  'json');
  url.searchParams.set('limit',   '1');
  url.searchParams.set('offset',  '0');

  const first = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!first.ok) throw new Error(`API ${first.status}`);
  const meta  = await first.json() as { total?: number };
  const total = Number(meta.total || 0);
  const pages = Math.max(1, Math.ceil(total / FETCH_LIMIT));

  const raw: Record<string, unknown>[] = [];
  for (let p = 0; p < pages; p++) {
    const batch = await fetchPage(apiKey, p * FETCH_LIMIT);
    raw.push(...batch);
    if (p < pages - 1) await new Promise((r) => setTimeout(r, 300));
  }

  // Deduplicate
  const dedup = new Map<string, MandiRecord>();
  for (const r of raw) {
    const norm = normaliseRecord(r);
    dedup.set(recordKey(norm), norm);
  }
  return [...dedup.values()];
}

// ── Cached data access ────────────────────────────────────────────────────────

interface CacheResult {
  records:      MandiRecord[];
  fetchedAt:    string;
  recordCount:  number;
  apiConfigured: boolean;
}

const MANDI_CACHE_TAG = 'mandi-records';

/** Fetches all Agmarknet records and caches for 24 h. */
const _fetchCached = unstable_cache(
  async (apiKey: string): Promise<CacheResult> => {
    const records   = await fetchAllRecords(apiKey);
    const fetchedAt = new Date().toISOString();
    return { records, fetchedAt, recordCount: records.length, apiConfigured: true };
  },
  [MANDI_CACHE_TAG],
  { revalidate: 86400, tags: [MANDI_CACHE_TAG] }
);

export async function getCachedRecords(): Promise<CacheResult> {
  const apiKey = process.env.DATAGOV_API_KEY || '';
  if (!apiKey) {
    return { records: [], fetchedAt: new Date().toISOString(), recordCount: 0, apiConfigured: false };
  }
  return _fetchCached(apiKey);
}

export { MANDI_CACHE_TAG };

// ── Aggregation helpers ───────────────────────────────────────────────────────

export function buildHistory(records: MandiRecord[]): MandiHistoryPoint[] {
  const grouped = new Map<string, {
    modalValues: number[]; minValues: number[]; maxValues: number[];
    markets: Set<string>; count: number;
  }>();

  for (const r of records) {
    const key = r.arrival_date || 'Unknown';
    const ex = grouped.get(key) ?? { modalValues: [], minValues: [], maxValues: [], markets: new Set(), count: 0 };
    if (typeof r.modal_price === 'number') ex.modalValues.push(r.modal_price);
    if (typeof r.min_price   === 'number') ex.minValues.push(r.min_price);
    if (typeof r.max_price   === 'number') ex.maxValues.push(r.max_price);
    if (r.market) ex.markets.add(r.market);
    ex.count++;
    grouped.set(key, ex);
  }

  return [...grouped.values()
    ? [...grouped.entries()].map(([k, g]) => ({
        arrival_date:    k,
        avg_modal_price: safeAverage(g.modalValues),
        avg_min_price:   safeAverage(g.minValues),
        avg_max_price:   safeAverage(g.maxValues),
        markets_count:   g.markets.size,
        records_count:   g.count,
      }))
    : []
  ].sort((a, b) => a.arrival_date.localeCompare(b.arrival_date));
}

export function buildSummary(records: MandiRecord[], fetchedAt: string | null) {
  const modalValues = records.map((r) => r.modal_price).filter((v): v is number => typeof v === 'number');
  const minValues   = records.map((r) => r.min_price).filter((v): v is number => typeof v === 'number');
  const maxValues   = records.map((r) => r.max_price).filter((v): v is number => typeof v === 'number');
  const markets     = [...new Set(records.map((r) => r.market).filter(Boolean))];

  const latestRows = records.slice().sort((a, b) => b.arrival_date.localeCompare(a.arrival_date));
  const marketMap  = new Map<string, typeof latestRows[0]>();
  for (const r of latestRows) {
    if (!marketMap.has(r.market || 'Unknown')) marketMap.set(r.market || 'Unknown', r);
  }
  const topMarkets = [...marketMap.values()]
    .filter((r) => typeof r.modal_price === 'number')
    .sort((a, b) => (b.modal_price ?? 0) - (a.modal_price ?? 0))
    .slice(0, 10)
    .map((r) => ({
      market: r.market, district: r.district, state: r.state,
      modal_price: r.modal_price, min_price: r.min_price, max_price: r.max_price,
      arrival_date: r.arrival_date,
    }));

  const latestArrivalDate = records.map((r) => r.arrival_date).filter(Boolean).sort().at(-1) ?? null;

  return {
    latestSnapshotDate: fetchedAt ? fetchedAt.slice(0, 10) : null,
    latestArrivalDate,
    recordsCount: records.length,
    marketsCount: markets.length,
    avgModalPrice:      safeAverage(modalValues),
    avgMinPrice:        safeAverage(minValues),
    avgMaxPrice:        safeAverage(maxValues),
    lowestModalPrice:   modalValues.length ? Math.min(...modalValues) : null,
    highestModalPrice:  modalValues.length ? Math.max(...modalValues) : null,
    topMarkets,
  };
}

export function buildOptions(records: MandiRecord[]) {
  const uniq = (vals: (string | null | undefined)[]) =>
    [...new Set(vals.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
  return {
    commodities: uniq(records.map((r) => r.commodity)),
    states:      uniq(records.map((r) => r.state)),
    districts:   uniq(records.map((r) => r.district)),
    markets:     uniq(records.map((r) => r.market)),
    varieties:   uniq(records.map((r) => r.variety)),
    grades:      uniq(records.map((r) => r.grade)),
  };
}

// ── Holt's Double Exponential Smoothing ──────────────────────────────────────

function holtFit(values: number[], alpha: number, beta: number): { level: number; trend: number } {
  let level = values[0];
  let trend = (values[Math.min(values.length - 1, 6)] - values[0]) / Math.min(values.length - 1, 6);
  for (let i = 1; i < values.length; i++) {
    const prev = level;
    level = alpha * values[i] + (1 - alpha) * (prev + trend);
    trend = beta * (level - prev) + (1 - beta) * trend;
  }
  return { level, trend };
}

export function holtForecast(values: number[], horizon = 14): HoltResult | null {
  if (values.length < 7) return null;

  const ALPHAS = [0.1, 0.2, 0.3, 0.4, 0.5];
  const BETAS  = [0.05, 0.1, 0.2, 0.3];

  let bestAlpha = 0.3, bestBeta = 0.1, bestMape = Infinity;

  if (values.length >= 14) {
    const train = values.slice(0, -7);
    const test  = values.slice(-7);
    for (const alpha of ALPHAS) {
      for (const beta of BETAS) {
        const { level, trend } = holtFit(train, alpha, beta);
        let sumErr = 0, cnt = 0;
        for (let h = 1; h <= test.length; h++) {
          const pred = level + h * trend;
          if (test[h - 1] > 0) { sumErr += Math.abs((test[h - 1] - pred) / test[h - 1]); cnt++; }
        }
        const mape = cnt ? (sumErr / cnt) * 100 : Infinity;
        if (mape < bestMape) { bestMape = mape; bestAlpha = alpha; bestBeta = beta; }
      }
    }
  }

  const { level, trend } = holtFit(values, bestAlpha, bestBeta);

  const window = Math.min(values.length - 1, 14);
  const errors: number[] = [];
  for (let i = values.length - window; i < values.length; i++) {
    const pred = level + (i - values.length + 1) * trend;
    if (values[i] > 0) errors.push(Math.abs((values[i] - pred) / values[i]) * 100);
  }
  const mape = errors.length ? errors.reduce((s, e) => s + e, 0) / errors.length : 10;

  const today    = new Date();
  const forecast = [];
  for (let h = 1; h <= horizon; h++) {
    const price = Math.max(0, level + h * trend);
    const uncertaintyFactor = 1.5 + (h / horizon) * 0.5;
    const uncertainty = price * (mape / 100) * uncertaintyFactor;
    const date = new Date(today);
    date.setDate(date.getDate() + h);
    forecast.push({
      date:  date.toISOString().slice(0, 10),
      price: Number(price.toFixed(2)),
      lower: Number(Math.max(0, price - uncertainty).toFixed(2)),
      upper: Number((price + uncertainty).toFixed(2)),
    });
  }

  const trendPct = values.length >= 2
    ? ((forecast[horizon - 1].price - values[values.length - 1]) / values[values.length - 1]) * 100
    : 0;

  return {
    forecast,
    mape:      Number(mape.toFixed(2)),
    direction: trendPct > 1 ? 'up' : trendPct < -1 ? 'down' : 'flat',
    trend_pct: Number(trendPct.toFixed(2)),
    alpha:     bestAlpha,
    beta:      bestBeta,
    data_points: values.length,
  };
}

export function rollingBacktest(values: number[], window = 14): BacktestResult {
  if (values.length < 14) return { mae: null, rmse: null, smape: null };
  const testStart = Math.max(7, values.length - window);
  const errors: { actual: number; pred: number }[] = [];
  for (let t = testStart; t < values.length; t++) {
    const train  = values.slice(0, t);
    const actual = values[t];
    const { level, trend } = holtFit(train, 0.3, 0.1);
    errors.push({ actual, pred: level + trend });
  }
  if (!errors.length) return { mae: null, rmse: null, smape: null };

  const mae  = errors.reduce((s, e) => s + Math.abs(e.actual - e.pred), 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((s, e) => s + (e.actual - e.pred) ** 2, 0) / errors.length);
  const smape = errors.reduce((s, e) => {
    const denom = (Math.abs(e.actual) + Math.abs(e.pred)) / 2;
    return s + (denom > 0 ? Math.abs(e.actual - e.pred) / denom : 0);
  }, 0) / errors.length * 100;

  return {
    mae:   Number(mae.toFixed(2)),
    rmse:  Number(rmse.toFixed(2)),
    smape: Number(smape.toFixed(2)),
  };
}
