import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictorRelease, predictorAccessError, PREDICTOR_DISCLAIMER } from '@/lib/product/predictor';
import { listSnapshotDates, loadRecords } from '@/lib/forecasting/data/loader';

// Fast status check — no data fetch, just confirms the user can access the predictor
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const session = await getServerSession();
  if (!canAccessPredictorRelease(session)) {
    return NextResponse.json({ error: predictorAccessError(session) }, { status: 403 });
  }

  const snapshotDates = listSnapshotDates();
  const apiConfigured = !!process.env.DATAGOV_API_KEY || snapshotDates.length > 0;
  const lastSnapshotDate: string | null = snapshotDates.at(-1) ?? null;
  let lastRefreshAt: string | null = null;
  let lastRecordCount = 0;

  try {
    const loaded = await loadRecords();
    lastRefreshAt = loaded.fetchedAt;
    lastRecordCount = loaded.records.length;
  } catch (error) {
    console.error('[/api/predictor/status]', error);
  }

  return NextResponse.json({
    ok:               true,
    apiConfigured,
    lastRefreshAt,
    lastSnapshotDate,
    lastRecordCount,
    inProgress:       false,
    error:            apiConfigured ? null : 'DATAGOV_API_KEY not configured',
    totalSnapshots:   snapshotDates.length,
    snapshotDates,
    disclaimer:       PREDICTOR_DISCLAIMER,
  });
}
