import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictor } from '@/lib/auth/entitlement';

// Fast status check — no data fetch, just confirms the user can access the predictor
export async function GET() {
  const session = await getServerSession();
  if (!canAccessPredictor(session)) {
    return NextResponse.json({ error: 'Premium access required.' }, { status: 403 });
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
  });
}
