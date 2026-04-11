import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictor } from '@/lib/auth/entitlement';
import { getCachedRecords } from '@/lib/mandi/engine';

export async function GET() {
  const session = await getServerSession();
  if (!canAccessPredictor(session)) {
    return NextResponse.json({ error: 'Premium access required.' }, { status: 403 });
  }

  try {
    const { fetchedAt, recordCount, apiConfigured } = await getCachedRecords();
    return NextResponse.json({
      lastRefreshAt:    fetchedAt,
      lastSnapshotDate: fetchedAt ? fetchedAt.slice(0, 10) : null,
      lastRecordCount:  recordCount,
      inProgress:       false,
      error:            apiConfigured ? null : 'DATAGOV_API_KEY not configured',
      totalSnapshots:   recordCount > 0 ? 1 : 0,
      snapshotDates:    fetchedAt ? [fetchedAt.slice(0, 10)] : [],
    });
  } catch (err) {
    return NextResponse.json({
      lastRefreshAt: null, lastSnapshotDate: null, lastRecordCount: 0,
      inProgress: false, error: String(err), totalSnapshots: 0, snapshotDates: [],
    });
  }
}
