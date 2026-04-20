import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictorRelease, predictorAccessError, PREDICTOR_DISCLAIMER } from '@/lib/product/predictor';
import { listSnapshotDates, loadRecords } from '@/lib/forecasting/data/loader';
import { getStoreStatus } from '@/lib/forecasting/data/store';
import { getSeedFetchedAt } from '@/lib/forecasting/data/seed';

export const dynamic  = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const session = await getServerSession();
  if (!canAccessPredictorRelease(session)) {
    return NextResponse.json({ error: predictorAccessError(session) }, { status: 403 });
  }

  const snapshotDates  = listSnapshotDates();
  const seedFetchedAt  = getSeedFetchedAt();
  const seedAgeDays    = Math.floor((Date.now() - new Date(seedFetchedAt).getTime()) / 86_400_000);

  let dataSource: string   = 'unknown';
  let fetchedAt:  string   = seedFetchedAt;
  let recordCount = 0;
  let dbDayCount: number | undefined;

  try {
    const loaded = await loadRecords();
    dataSource   = loaded.source;
    fetchedAt    = loaded.fetchedAt;
    recordCount  = loaded.records.length;
    dbDayCount   = loaded.dbDayCount;
  } catch (e) {
    console.error('[/api/predictor/status]', e);
  }

  const storeStatus = await getStoreStatus();

  return NextResponse.json({
    ok:             true,
    dataSource,
    fetchedAt,
    recordCount,
    apiKeySet:      !!process.env.DATAGOV_API_KEY,

    // Snapshot tier (local dev only)
    snapshots: {
      count:      snapshotDates.length,
      latestDate: snapshotDates.at(-1) ?? null,
    },

    // MongoDB tier
    mongodb: {
      configured:  storeStatus.configured,
      dayCount:    storeStatus.dayCount,
      latestDate:  storeStatus.latestDate,
      oldestDate:  storeStatus.oldestDate,
      totalRecords: storeStatus.totalRecords,
      dbDayCount,
    },

    // Seed tier
    seed: {
      fetchedAt:  seedFetchedAt,
      ageDays:    seedAgeDays,
    },

    disclaimer: PREDICTOR_DISCLAIMER,
  });
}
