/**
 * Data loader for the forecasting engine.
 *
 * Priority:
 *   1. Read all JSON snapshot files from mandi-service/data/snapshots/
 *      (fast, no network, 91 days of history)
 *   2. Fall back to live Agmarknet API (via existing mandi engine)
 *      if snapshots directory is absent or empty.
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

// ── Snapshot loader ───────────────────────────────────────────────────────────

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

// ── Live API fallback ──────────────────────────────────────────────────────────

async function loadFromAgmarknet(
  filters: { commodity: string; state?: string; market?: string },
  daysBack = 90,
): Promise<{ records: MandiRecord[]; fetchedAt: string }> {
  const { getHistoricalRecords } = await import('../../mandi/engine');
  const result = await getHistoricalRecords(
    {
      commodity: filters.commodity,
      state:     filters.state     ?? '',
      district:  '',
      market:    filters.market    ?? '',
      variety:   '',
      grade:     '',
    },
    daysBack,
  );
  return { records: result.records, fetchedAt: result.fetchedAt };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface LoadResult {
  records:    MandiRecord[];
  fetchedAt:  string;
  source:     'snapshots' | 'agmarknet';
  snapshotCount: number;
}

/**
 * Load all available mandi records.
 *
 * Uses snapshot files when available (preferred — fast, 90-day window).
 * Falls back to live Agmarknet API for specific commodity/market queries.
 *
 * @param fallbackFilters  Filters for live API fallback (only used when snapshots absent)
 */
export async function loadRecords(
  fallbackFilters?: { commodity: string; state?: string; market?: string },
): Promise<LoadResult> {
  const snap = await loadFromSnapshots();

  if (snap) {
    return {
      records:       snap.records,
      fetchedAt:     snap.fetchedAt,
      source:        'snapshots',
      snapshotCount: fs.readdirSync(SNAPSHOTS_DIR).filter((f) => f.endsWith('.json')).length,
    };
  }

  // Live fallback — requires commodity filter
  const filters = fallbackFilters ?? { commodity: '' };
  const live = await loadFromAgmarknet(filters);
  return {
    records:       live.records,
    fetchedAt:     live.fetchedAt,
    source:        'agmarknet',
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
