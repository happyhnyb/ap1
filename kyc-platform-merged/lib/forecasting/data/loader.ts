/**
 * Data loader for the forecasting engine.
 *
 * Priority:
 *   1. Read all JSON snapshot files from mandi-service/data/snapshots/
 *      (fast, no network, 91 days of history) — local dev / self-hosted only
 *   2. Seed data (lib/forecasting/data/seed-series.json) — committed to git,
 *      covers ~30 days of history, always available on Vercel
 *   3. Live Agmarknet API — used to enrich seed with the most recent 7 days
 *      when DATAGOV_API_KEY is set.  Only called with specific commodity+state
 *      filters to keep request count low (< 10 API calls, < 2 s on serverless).
 *
 * Each snapshot file: { snapshotDate, fetchedAt, records: MandiRecord[] }
 *
 * Returns merged, de-duplicated MandiRecord[] with the fetch timestamp.
 */

import fs from 'fs';
import path from 'path';
import type { MandiRecord } from '../../mandi/types';
import { mergeRecords } from '../preprocessing/pipeline';

const SNAPSHOTS_DIR = path.resolve(process.cwd(), 'mandi-service/data/snapshots');

// Days of live-API history to overlay on top of the seed when no snapshots
// exist.  Kept small so the 7 parallel date-requests stay well within the
// Vercel 10 s serverless timeout.
const LIVE_ENRICH_DAYS = 7;

interface SnapshotFile {
  snapshotDate: string;
  fetchedAt:    string;
  records:      MandiRecord[];
}

type SnapshotCacheEntry = {
  fingerprint: string;
  result: { records: MandiRecord[]; fetchedAt: string } | null;
};

let snapshotCache: SnapshotCacheEntry | null = null;

// ── 1. Snapshot loader (local / self-hosted) ──────────────────────────────────

/**
 * Read all snapshot JSON files and merge their records.
 * Returns null if the snapshots directory does not exist.
 */
async function loadFromSnapshots(): Promise<{ records: MandiRecord[]; fetchedAt: string } | null> {
  if (!fs.existsSync(SNAPSHOTS_DIR)) return null;

  const files = fs.readdirSync(SNAPSHOTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort(); // ascending date order

  if (!files.length) return null;

  const lastFile = files.at(-1) ?? '';
  const stats = lastFile ? fs.statSync(path.join(SNAPSHOTS_DIR, lastFile)) : null;
  const fingerprint = `${files.length}:${lastFile}:${stats?.mtimeMs ?? 0}`;
  if (snapshotCache?.fingerprint === fingerprint) {
    return snapshotCache.result;
  }

  const batches: MandiRecord[][] = [];
  let latestFetchedAt = new Date(0).toISOString();

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(SNAPSHOTS_DIR, file), 'utf-8');
      const snap: SnapshotFile = JSON.parse(raw);
      if (Array.isArray(snap.records) && snap.records.length) {
        batches.push(snap.records);
        if (snap.fetchedAt > latestFetchedAt) latestFetchedAt = snap.fetchedAt;
      }
    } catch {
      // Skip corrupt files
    }
  }

  if (!batches.length) return null;

  const merged = mergeRecords(batches);
  const result = { records: merged, fetchedAt: latestFetchedAt };
  snapshotCache = { fingerprint, result };
  return result;
}

// ── 2. Seed loader (always available, committed to git) ───────────────────────

async function loadFromSeed(): Promise<{ records: MandiRecord[]; fetchedAt: string }> {
  const { getSeedRecords, getSeedFetchedAt } = await import('./seed');
  return {
    records:   getSeedRecords(),   // ~115 k rows, all commodities, ~30 dates
    fetchedAt: getSeedFetchedAt(),
  };
}

// ── 3. Live API enrichment (recent days only) ─────────────────────────────────

/**
 * Fetch the most recent `days` days from the live Agmarknet API, filtered by
 * commodity (and optionally state/market).  Always uses explicit filters so
 * each date-request returns only the records we care about (< 500 per day for
 * most selections) — well within Vercel's serverless time budget.
 *
 * Returns null when DATAGOV_API_KEY is absent or the API call fails.
 */
async function fetchRecentLive(
  filters: { commodity: string; state?: string; market?: string },
  days = LIVE_ENRICH_DAYS,
): Promise<{ records: MandiRecord[]; fetchedAt: string } | null> {
  const apiKey = process.env.DATAGOV_API_KEY;
  if (!apiKey || !filters.commodity) return null;

  try {
    const { getHistoricalRecords } = await import('../../mandi/engine');
    const result = await getHistoricalRecords(
      {
        commodity: filters.commodity,
        state:     filters.state   ?? '',
        district:  '',
        market:    filters.market  ?? '',
        variety:   '',
        grade:     '',
      },
      days,
    );
    if (!result.records.length) return null;
    return { records: result.records, fetchedAt: result.fetchedAt };
  } catch {
    return null;
  }
}

/**
 * Fetch today's all-commodity snapshot from the live API (no date filter).
 * Used when building filter options with no commodity selected.
 * MAX_PAGES × 500 = up to 5 000 records in ~10 parallel requests — fast.
 *
 * Returns null when DATAGOV_API_KEY is absent or the API call fails.
 */
async function fetchTodayAll(): Promise<{ records: MandiRecord[]; fetchedAt: string } | null> {
  const apiKey = process.env.DATAGOV_API_KEY;
  if (!apiKey) return null;

  try {
    const { getRecords } = await import('../../mandi/engine');
    const result = await getRecords();
    if (!result.records.length) return null;
    return { records: result.records, fetchedAt: result.fetchedAt };
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface LoadResult {
  records:       MandiRecord[];
  fetchedAt:     string;
  source:        'snapshots' | 'agmarknet' | 'seed';
  snapshotCount: number;
}

/**
 * Load all available mandi records.
 *
 * On local dev (with mandi-service running): uses snapshot files — fast,
 * 90-day window, no network requests.
 *
 * On Vercel (no snapshots): uses seed data (committed to git, ~30 days) as
 * the history baseline and overlays the most recent LIVE_ENRICH_DAYS days
 * from the live Agmarknet API when DATAGOV_API_KEY is set.  Calls are always
 * filtered by commodity+state so the per-call record count stays low.
 *
 * @param filters  Commodity + optional state/market.  Pass these whenever
 *                 available so the live-API enrichment path can apply filters.
 */
export async function loadRecords(
  filters?: { commodity: string; state?: string; market?: string },
): Promise<LoadResult> {

  // ── Path A: local snapshot files ───────────────────────────────────────────
  const snap = await loadFromSnapshots();
  if (snap) {
    return {
      records:       snap.records,
      fetchedAt:     snap.fetchedAt,
      source:        'snapshots',
      snapshotCount: fs.readdirSync(SNAPSHOTS_DIR).filter((f) => f.endsWith('.json')).length,
    };
  }

  // ── Path B: Vercel / no mandi-service ─────────────────────────────────────
  // Load seed as the historical base (always succeeds, no network needed).
  const seed = await loadFromSeed();

  if (filters?.commodity) {
    // Commodity-specific call: enrich seed with live recent days.
    const live = await fetchRecentLive(filters, LIVE_ENRICH_DAYS);
    if (live?.records.length) {
      const merged = mergeRecords([seed.records, live.records]);
      return {
        records:       merged,
        fetchedAt:     live.fetchedAt,
        source:        'agmarknet',
        snapshotCount: 0,
      };
    }
  } else {
    // Options-building call (no commodity): try today's all-commodity snapshot.
    const today = await fetchTodayAll();
    if (today?.records.length) {
      const merged = mergeRecords([seed.records, today.records]);
      return {
        records:       merged,
        fetchedAt:     today.fetchedAt,
        source:        'agmarknet',
        snapshotCount: 0,
      };
    }
  }

  // ── Seed-only fallback (no API key or API unavailable) ────────────────────
  return {
    records:       seed.records,
    fetchedAt:     seed.fetchedAt,
    source:        'seed',
    snapshotCount: 0,
  };
}

/**
 * List available snapshot dates (for status/debug endpoints).
 */
export function listSnapshotDates(): string[] {
  if (!fs.existsSync(SNAPSHOTS_DIR)) return [];
  return fs.readdirSync(SNAPSHOTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''))
    .sort();
}
