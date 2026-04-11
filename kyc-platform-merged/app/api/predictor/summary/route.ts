import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictor } from '@/lib/auth/entitlement';
import { getCachedRecords, filterRecords, buildSummary, filtersFromQuery } from '@/lib/mandi/engine';

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!canAccessPredictor(session)) {
    return NextResponse.json({ error: 'Premium access required.' }, { status: 403 });
  }

  const q: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => { q[k] = v; });

  try {
    const { records, fetchedAt } = await getCachedRecords();
    const filtered = filterRecords(records, filtersFromQuery(q));
    return NextResponse.json(buildSummary(filtered, fetchedAt));
  } catch {
    return NextResponse.json({ error: 'Predictor service unavailable.' }, { status: 503 });
  }
}
