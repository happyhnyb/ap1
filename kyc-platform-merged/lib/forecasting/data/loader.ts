/**
 * Data loader for the forecasting engine.
 *
 * Four-tier priority (fastest / richest first):
 *
 *   1. Local snapshot files  (mandi-service/data/snapshots/*.json)
 *      ✓ Local dev / self-hosted  ✗ Not on Vercel (gitignored)
 *      → 90-day full history, no network
 *
 *   2. MongoDB store  (lib/forecasting/data/store.ts)
 *      ✓ Vercel + local when MONGODB_URI is set
 *      → Accumulates daily forever; grows richer with each cron run
 *      → After 90 daily runs the model has a full 90-day training window
 *
 *   3. Seed file  (lib/forecasting/data/seed-series.json)
 *      ✓ Always available — committed to git, ~30 dates
 *      → Refreshed by GitHub Actions daily; guaranteed floor
 *
 *   4. Live Agmarknet API  (fallback enrichment)
 *      ✓ When DATAGOV_API_KEY is set
 *      → Overlays the most recent 7 days on top of the seed
 *      → Only called with explicit commodity+state filters (≤ 10 API calls)
 *
 * The source field tells callers which tier was used.
 */

import fs from 'fs';
import path from 'path';
import type { MandiRecord } from '../../mandi/types';
import { mergeRecords } from '../preprocessing/pipeline';

const SNAPSHOTS_DIR = path.resolve(process.cwd(), 'mandi-service/data/snapshots');

/** Days of live-API enrichment layered on top of the seed fallback */
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

// ── Tier 1: local snapshot files ──────────────────────────────────────────────

async function loadFromSnapshots(): Promise<{ records: MandiRecord[]; fetchedAt: string } | null> {
  if (!fs.existsSync(SNAPSHOTS_DIR)) return null;

  const files = fs.readdirSync(SNAPSHOTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  if (!files.length) return null;

  const lastFile = files.at(-1) ?? '';
  const stats     = lastFile ? fs.statSync(path.join(SNAPSHOTS_DIR, lastFile)) : null;
  const fingerprint = `${files.length}:${lastFile}:${stats?.mtimeMs ?? 0}`;
  if (snapshotCache?.fingerprint === fingerprint) return snapshotCache.result;

  const batches: MandiRecord[][] = [];
  let latestFetchedAt = new Date(0).toISOString();

  for (const file of files) {
    try {
      const raw  = fs.readFileSync(path.join(SNAPSHOTS_DIR, file), 'utf-8');
      const snap: SnapshotFile = JSON.parse(raw);
      if (Array.isArray(snap.records) && snap.records.length) {
        batches.push(snap.records);
        if (snap.fetchedAt > latestFetchedAt) latestFetchedAt = snap.fetchedAt;
      }
    } catch { /* skip corrupt */ }
  }

  if (!batches.length) return null;

  const result = { records: mergeRecords(batches), fetchedAt: latestFetchedAt };
  snapshotCache = { fingerprint, result };
  return result;
}

// ── Tier 2: MongoDB persistent store ─────────────────────────────────────────

async function loadFromMongoDB(): Promise<{ records: MandiRecord[]; fetchedAt: string; dayCount: number } | null> {
  try {
    const { loadFromStore } = await import('./store');
    const result = await loadFromStore(90);
    if (!result || !result.records.length) return null;
    return { records: result.records, fetchedAt: result.fetchedAt, dayCount: result.dayCount };
  } catch {
    return null;
  }
}

// ── Tier 3: seed file (always available) ─────────────────────────────────────

async function loadFromSeed(): Promise<{ records: MandiRecord[]; fetchedAt: string }> {
  const { getSeedRecords, getSeedFetchedAt } = await import('./seed');
  return { records: getSeedRecords(), fetchedAt: getSeedFetchedAt() };
}

// ── Tier 4: live Agmarknet API (enrichment only) ──────────────────────────────

/**
 * Fetch the last `days` days from the live API for a specific commodity+state.
 * Only called when DATAGOV_API_KEY is set.  Always filtered — never fetches
 * all records unfiltered (that would be ~900 API calls for 90 days).
 */
async function fetchRecentLive(
  filters: { commodity: string; state?: string; market?: string },
  days = LIVE_ENRICH_DAYS,
): Promise<{ records: MandiRecord[]; fetchedAt: string } | null> {
  if (!process.env.DATAGOV_API_KEY || !filters.commodity) return null;
  try {
    const { getHistoricalRecords } = await import('../../mandi/engine');
    const result = await getHistoricalRecords(
      { commodity: filters.commodity, state: filters.state ?? '', district: '', market: filters.market ?? '', variety: '', grade: '' },
      days,
    );
    return result.records.length ? { records: result.records, fetchedAt: result.fetchedAt } : null;
  } catch { return null; }
}

/**
 * Fetch today's all-commodity batch from the live API (no date filter).
 * Used for options building (no commodity selected yet).
 * MAX_PAGES × 500 = up to 5 000 records in ≤ 10 parallel requests.
 */
async function fetchTodayAll(): Promise<{ records: MandiRecord[]; fetchedAt: string } | null> {
  if (!process.env.DATAGOV_API_KEY) return null;
  try {
    const { getRecords } = await import('../../mandi/engine');
    const result = await getRecords();
    return result.records.length ? { records: result.records, fetchedAt: result.fetchedAt } : null;
  } catch { return null; }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface LoadResult {
  records:       MandiRecord[];
  fetchedAt:     string;
  source:        'snapshots' | 'mongodb' | 'agmarknet' | 'seed' | 'hybrid';
  snapshotCount: number;
  /** For MongoDB tier: how many date-days are included */
  dbDayCount?:   number;
}

/**
 * Load all available mandi records using the four-tier strategy above.
 *
 * Pass `filters` whenever you know the commodity (engine calls always do).
 * The page-level options call passes no filters — gets today's all-commodity
 * batch from the live API or falls back to seed.
 */
export async function loadRecords(
  filters?: { commodity: string; state?: string; market?: string },
): Promise<LoadResult> {

  // ── Tier 1: local snapshots ───────────────────────────────────────────────
  const snap = await loadFromSnapshots();
  if (snap) {
    return {
      records:       snap.records,
      fetchedAt:     snap.fetchedAt,
      source:        'snapshots',
      snapshotCount: fs.readdirSync(SNAPSHOTS_DIR).filter((f) => f.endsWith('.json')).length,
    };
  }

  // ── Tier 2: MongoDB (rich, grows daily) ───────────────────────────────────
  const mongo = await loadFromMongoDB();
  const seed = await loadFromSeed();
  const baseRecords = mongo?.records.length
    ? mergeRecords([seed.records, mongo.records])
    : seed.records;
  const baseFetchedAt = mongo?.records.length ? mongo.fetchedAt : seed.fetchedAt;
  const baseSource: LoadResult['source'] = mongo?.records.length ? 'hybrid' : 'seed';

  if (filters?.commodity) {
    // Commodity-specific call: layer recent live rows on top of seed + Mongo.
    const live = await fetchRecentLive(filters, LIVE_ENRICH_DAYS);
    if (live?.records.length) {
      return {
        records:       mergeRecords([baseRecords, live.records]),
        fetchedAt:     live.fetchedAt,
        source:        mongo?.records.length ? 'hybrid' : 'agmarknet',
        snapshotCount: 0,
        dbDayCount:    mongo?.dayCount,
      };
    }
  } else {
    // Options-building call: add today's full batch to the best local base.
    const today = await fetchTodayAll();
    if (today?.records.length) {
      return {
        records:       mergeRecords([baseRecords, today.records]),
        fetchedAt:     today.fetchedAt,
        source:        mongo?.records.length ? 'hybrid' : 'agmarknet',
        snapshotCount: 0,
        dbDayCount:    mongo?.dayCount,
      };
    }
  }

  // ── Best available local base (seed-only or seed + Mongo) ─────────────────
  return {
    records:       baseRecords,
    fetchedAt:     baseFetchedAt,
    source:        baseSource,
    snapshotCount: 0,
    dbDayCount:    mongo?.dayCount,
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
