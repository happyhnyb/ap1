import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictorRelease, predictorAccessError, PREDICTOR_DISCLAIMER } from '@/lib/product/predictor';

// Fast status check — no data fetch, just confirms the user can access the predictor
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const session = await getServerSession();
  if (!canAccessPredictorRelease(session)) {
    return NextResponse.json({ error: predictorAccessError(session) }, { status: 403 });
  }

  const apiConfigured = !!process.env.DATAGOV_API_KEY;
  return NextResponse.json({
    ok:               true,
    apiConfigured,
    lastRefreshAt:    null,
    lastSnapshotDate: null,
    lastRecordCount:  0,
    inProgress:       false,
    error:            apiConfigured ? null : 'DATAGOV_API_KEY not configured',
    totalSnapshots:   0,
    snapshotDates:    [],
    disclaimer:       PREDICTOR_DISCLAIMER,
  });
}
