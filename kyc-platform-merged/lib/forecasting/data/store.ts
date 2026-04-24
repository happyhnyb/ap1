/**
 * MongoDB-backed mandi snapshot store.
 *
 * Provides two public functions:
 *
 *   loadFromStore(days?)  → Read up to `days` days of MandiRecords from
 *                           MongoDB.  Returns null when Mongo is not
 *                           configured or the collection is empty.
 *
 *   upsertSnapshot(date, records, fetchedAt)
 *                         → Write / overwrite a single day's records.
 *                           Idempotent — safe to call on re-runs.
 *
 * Data flow:
 *   Vercel Cron (daily) → upsertSnapshot  ← live Agmarknet records
 *   Forecasting loader  → loadFromStore   → MandiRecords[] for engine
 *
 * MongoDB is the accumulation layer: unlike the static seed-series.json
 * (which must be committed to git), records here grow every day and give
 * the forecasting models an ever-richer training window (up to 90 days).
 */

import { connectDB, isMongoConfigured } from '@/lib/db/connect';
import type { MandiRecord } from '@/lib/mandi/types';
import { mergeRecords } from '../preprocessing/pipeline';

/** Max days to read back from MongoDB (caps query size / memory) */
const STORE_DAYS_BACK = 90;

// ── Lazy model import to avoid Mongoose registration at module load time ───────

async function getModel() {
  const { default: MandiSnapshot } = await import('../../db/models/MandiSnapshot');
  return MandiSnapshot;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export interface StoreResult {
  records:    MandiRecord[];
  fetchedAt:  string;
  /** How many date-documents were merged */
  dayCount:   number;
  /** Oldest date included */
  fromDate:   string;
  /** Most recent date included */
  toDate:     string;
}

/**
 * Load up to `daysBack` days of MandiRecords from the MongoDB store.
 *
 * Returns null when:
 *   - MONGODB_URI is not set
 *   - The connection fails
 *   - The collection has no documents in the requested window
 */
export async function loadFromStore(
  daysBack = STORE_DAYS_BACK,
): Promise<StoreResult | null> {
  if (!isMongoConfigured()) return null;

  try {
    await connectDB();
    const MandiSnapshot = await getModel();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Lean query — we only need date, records, fetchedAt
    const snapshots = await MandiSnapshot
      .find({ date: { $gte: cutoffStr } })
      .select('date records fetchedAt')
      .sort({ date: -1 })
      .limit(daysBack)
      .lean()
      .exec();

    if (!snapshots.length) return null;

    const batches = snapshots.map((s) => (s.records as unknown) as MandiRecord[]);
    const merged  = mergeRecords(batches);

    const dates = snapshots.map((s) => s.date).sort();

    return {
      records:   merged,
      fetchedAt: snapshots[0].fetchedAt,   // most recent fetch timestamp
      dayCount:  snapshots.length,
      fromDate:  dates[0],
      toDate:    dates.at(-1)!,
    };
  } catch (err) {
    console.error('[store] loadFromStore failed:', err);
    return null;
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Upsert a single day's snapshot into MongoDB.
 *
 * Safe to call multiple times — duplicate writes for the same date
 * overwrite the previous data (idempotent).
 *
 * Returns the number of records stored, or 0 on failure.
 */
export async function upsertSnapshot(
  date:      string,
  records:   MandiRecord[],
  fetchedAt: string,
  source:    'agmarknet' | 'synthetic' = 'agmarknet',
): Promise<number> {
  if (!isMongoConfigured()) return 0;
  if (!records.length)      return 0;

  try {
    await connectDB();
    const MandiSnapshot = await getModel();

    await MandiSnapshot.findOneAndUpdate(
      { date },
      {
        date,
        fetchedAt,
        records,
        recordCount: records.length,
        realCount:   source === 'agmarknet' ? records.length : 0,
        source,
      },
      { upsert: true, new: true },
    ).exec();

    return records.length;
  } catch (err) {
    console.error('[store] upsertSnapshot failed:', err);
    return 0;
  }
}

// ── Status helpers ────────────────────────────────────────────────────────────

export interface StoreStatus {
  configured: boolean;
  dayCount:   number;
  latestDate: string | null;
  oldestDate: string | null;
  totalRecords: number;
}

export async function getStoreStatus(): Promise<StoreStatus> {
  if (!isMongoConfigured()) {
    return { configured: false, dayCount: 0, latestDate: null, oldestDate: null, totalRecords: 0 };
  }

  try {
    await connectDB();
    const MandiSnapshot = await getModel();

    const [latest, oldest, total] = await Promise.all([
      MandiSnapshot.findOne().sort({ date: -1 }).select('date recordCount').lean(),
      MandiSnapshot.findOne().sort({ date:  1 }).select('date recordCount').lean(),
      MandiSnapshot.countDocuments(),
    ]);

    const totalRecords = await MandiSnapshot.aggregate([
      { $group: { _id: null, sum: { $sum: '$recordCount' } } },
    ]).then((res) => (res[0]?.sum ?? 0) as number);

    return {
      configured:   true,
      dayCount:     total,
      latestDate:   latest?.date ?? null,
      oldestDate:   oldest?.date ?? null,
      totalRecords,
    };
  } catch {
    return { configured: true, dayCount: 0, latestDate: null, oldestDate: null, totalRecords: 0 };
  }
}
