/**
 * Mandi data engine — runs entirely within Next.js (no separate service).
 *
 * Fetches commodity price data from data.gov.in (Agmarknet) and processes
 * it using Adaptive Holt's Double Exponential Smoothing for forecasting.
 *
 * Each API page URL is cached for 24 h by Next.js fetch cache.
 * Max pages: MAX_PAGES (caps fetch time in serverless environments).
 */

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
const MAX_PAGES   = 10; // fetch all pages in parallel → 5 000 records in ~500 ms
const HISTORY_DAYS = 30;

// ── Utilities ─────────────────────────────────────────────────────────────────

function parseNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function slug(v = '') { return String(v || '').trim().toLowerCase(); }

function parseToIso(dateStr: string): string {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const parts = dateStr.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

function getIsoDateDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function isoToAgmarknetDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function safeAverage(values: number[]): number | null {
  const clean = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  return clean.length
    ? Number((clean.reduce((s, v) => s + v, 0) / clean.length).toFixed(2))
    : null;
}

// ── Record normalisation ──────────────────────────────────────────────────────

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
    arrivals:     parseNumber(r.arrivals),
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

// ── API fetch (each page URL cached 24 h by Next.js fetch cache) ──────────────

function applyFilterParams(url: URL, filters: Partial<MandiFilters> & { arrival_date?: string }) {
  if (filters.arrival_date) url.searchParams.set('filters[arrival_date]', filters.arrival_date);
  if (filters.commodity)    url.searchParams.set('filters[commodity]', filters.commodity);
  if (filters.state)        url.searchParams.set('filters[state]', filters.state);
  if (filters.district)     url.searchParams.set('filters[district]', filters.district);
  if (filters.market)       url.searchParams.set('filters[market]', filters.market);
  if (filters.variety)      url.searchParams.set('filters[variety]', filters.variety);
  if (filters.grade)        url.searchParams.set('filters[grade]', filters.grade);
}

async function fetchPage(
  apiKey: string,
  offset: number,
  filters: Partial<MandiFilters> & { arrival_date?: string } = {}
): Promise<{ records: Record<string, unknown>[]; total: number }> {
  const url = new URL(BASE_URL);
  url.searchParams.set('api-key', apiKey);
  url.searchParams.set('format',  'json');
  url.searchParams.set('limit',   String(FETCH_LIMIT));
  url.searchParams.set('offset',  String(offset));
  applyFilterParams(url, filters);

  // next.revalidate caches this URL for 24 h in Next.js data cache
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    next: { revalidate: 86400 },
  });

  if (!res.ok) throw new Error(`Agmarknet API ${res.status}`);
  const data = await res.json() as { records?: Record<string, unknown>[]; total?: number };
  return { records: data.records ?? [], total: Number(data.total ?? 0) };
}

export async function fetchAllRecords(apiKey: string): Promise<MandiRecord[]> {
  if (!apiKey) throw new Error('DATAGOV_API_KEY is not configured');

  // Fetch first page to confirm data exists
  const first = await fetchPage(apiKey, 0);

  let allBatches: Record<string, unknown>[][] = [first.records];

  if (first.records.length === FETCH_LIMIT) {
    // Fetch all remaining pages IN PARALLEL — same wall-clock time as 1 page
    const rest = await Promise.all(
      Array.from({ length: MAX_PAGES - 1 }, (_, i) =>
        fetchPage(apiKey, (i + 1) * FETCH_LIMIT)
          .then((page) => page.records)
          .catch(() => [] as Record<string, unknown>[]) // ignore individual page errors
      )
    );
    allBatches = [first.records, ...rest];
  }

  const raw = allBatches.flat();
  const dedup = new Map<string, MandiRecord>();
  for (const r of raw) {
    const norm = normaliseRecord(r);
    dedup.set(recordKey(norm), norm);
  }
  return [...dedup.values()];
}

export async function fetchHistoricalRecords(
  apiKey: string,
  filters: MandiFilters,
  daysBack = HISTORY_DAYS
): Promise<MandiRecord[]> {
  if (!apiKey) throw new Error('DATAGOV_API_KEY is not configured');

  const batches = await Promise.all(
    Array.from({ length: daysBack }, async (_, i) => {
      const isoDate = getIsoDateDaysAgo(i);
      const arrival_date = isoToAgmarknetDate(isoDate);
      const first = await fetchPage(apiKey, 0, { ...filters, arrival_date });
      if (!first.records.length) return [] as MandiRecord[];

      const pages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(first.total / FETCH_LIMIT)));
      const rest = pages > 1
        ? await Promise.all(
            Array.from({ length: pages - 1 }, (_, pageIndex) =>
              fetchPage(apiKey, (pageIndex + 1) * FETCH_LIMIT, { ...filters, arrival_date })
                .then((page) => page.records)
                .catch(() => [] as Record<string, unknown>[])
            )
          )
        : [];

      const raw = [first.records, ...rest].flat();
      return raw.map((r) => normaliseRecord({ ...r, arrival_date: isoDate }));
    })
  );

  const dedup = new Map<string, MandiRecord>();
  for (const record of batches.flat()) {
    dedup.set(recordKey(record), record);
  }
  return [...dedup.values()];
}

export async function getRecords(): Promise<{ records: MandiRecord[]; fetchedAt: string; apiConfigured: boolean; error?: string }> {
  const apiKey = process.env.DATAGOV_API_KEY || '';
  if (!apiKey) {
    return { records: [], fetchedAt: new Date().toISOString(), apiConfigured: false, error: 'DATAGOV_API_KEY not configured' };
  }
  try {
    const records = await fetchAllRecords(apiKey);
    return { records, fetchedAt: new Date().toISOString(), apiConfigured: true };
  } catch (err) {
    console.error('[mandi] fetchAllRecords failed:', err);
    return { records: [], fetchedAt: new Date().toISOString(), apiConfigured: true, error: String(err) };
  }
}

export async function getHistoricalRecords(filters: MandiFilters, daysBack = HISTORY_DAYS): Promise<{ records: MandiRecord[]; fetchedAt: string; apiConfigured: boolean; error?: string }> {
  const apiKey = process.env.DATAGOV_API_KEY || '';
  if (!apiKey) {
    return { records: [], fetchedAt: new Date().toISOString(), apiConfigured: false, error: 'DATAGOV_API_KEY not configured' };
  }
  try {
    const records = await fetchHistoricalRecords(apiKey, filters, daysBack);
    return { records, fetchedAt: new Date().toISOString(), apiConfigured: true };
  } catch (err) {
    console.error('[mandi] fetchHistoricalRecords failed:', err);
    return { records: [], fetchedAt: new Date().toISOString(), apiConfigured: true, error: String(err) };
  }
}

// ── Aggregation ───────────────────────────────────────────────────────────────

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

  return [...grouped.entries()]
    .map(([k, g]) => ({
      arrival_date:    k,
      avg_modal_price: safeAverage(g.modalValues),
      avg_min_price:   safeAverage(g.minValues),
      avg_max_price:   safeAverage(g.maxValues),
      markets_count:   g.markets.size,
      records_count:   g.count,
    }))
    .sort((a, b) => a.arrival_date.localeCompare(b.arrival_date));
}

export function buildSummary(records: MandiRecord[], fetchedAt: string | null) {
  const modalValues = records.map((r) => r.modal_price).filter((v): v is number => typeof v === 'number');
  const minValues   = records.map((r) => r.min_price).filter((v): v is number => typeof v === 'number');
  const maxValues   = records.map((r) => r.max_price).filter((v): v is number => typeof v === 'number');
  const markets     = [...new Set(records.map((r) => r.market).filter(Boolean))];

  const latestRows = records.slice().sort((a, b) => b.arrival_date.localeCompare(a.arrival_date));
  const marketMap  = new Map<string, MandiRecord>();
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

  return {
    latestSnapshotDate: fetchedAt ? fetchedAt.slice(0, 10) : null,
    latestArrivalDate:  records.map((r) => r.arrival_date).filter(Boolean).sort().at(-1) ?? null,
    recordsCount:       records.length,
    marketsCount:       markets.length,
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

  // Build state → markets and state → districts mappings for dependent filters
  const marketsByState: Record<string, string[]> = {};
  const districtsByState: Record<string, string[]> = {};
  for (const r of records) {
    if (r.state && r.market) {
      (marketsByState[r.state] ??= new Set() as unknown as string[]);
      (districtsByState[r.state] ??= new Set() as unknown as string[]);
    }
  }
  // Use Sets then convert
  const mbs: Record<string, string[]> = {};
  const dbs: Record<string, string[]> = {};
  for (const r of records) {
    if (r.state) {
      if (r.market) {
        const markets = (mbs[r.state] ??= []);
        if (!markets.includes(r.market)) markets.push(r.market);
      }
      if (r.district) {
        const districts = (dbs[r.state] ??= []);
        if (!districts.includes(r.district)) districts.push(r.district);
      }
    }
  }
  Object.keys(mbs).forEach((s) => mbs[s].sort((a, b) => a.localeCompare(b)));
  Object.keys(dbs).forEach((s) => dbs[s].sort((a, b) => a.localeCompare(b)));

  return {
    commodities:    uniq(records.map((r) => r.commodity)),
    states:         uniq(records.map((r) => r.state)),
    districts:      uniq(records.map((r) => r.district)),
    markets:        uniq(records.map((r) => r.market)),
    varieties:      uniq(records.map((r) => r.variety)),
    grades:         uniq(records.map((r) => r.grade)),
    marketsByState: mbs,
    districtsByState: dbs,
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

  const today = new Date();
  const forecast = [];
  for (let h = 1; h <= horizon; h++) {
    const price = Math.max(0, level + h * trend);
    const uncertainty = price * (mape / 100) * (1.5 + (h / horizon) * 0.5);
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

  const mae   = errors.reduce((s, e) => s + Math.abs(e.actual - e.pred), 0) / errors.length;
  const rmse  = Math.sqrt(errors.reduce((s, e) => s + (e.actual - e.pred) ** 2, 0) / errors.length);
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
