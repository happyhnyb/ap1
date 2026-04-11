import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictor } from '@/lib/auth/entitlement';
import { getRecords, filterRecords, buildHistory, filtersFromQuery } from '@/lib/mandi/engine';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!canAccessPredictor(session)) {
    return NextResponse.json({ error: 'Premium access required.' }, { status: 403 });
  }

  const q: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => { q[k] = v; });

  try {
    const { records } = await getRecords();
    const filtered = filterRecords(records, filtersFromQuery(q));
    return NextResponse.json(buildHistory(filtered));
  } catch {
    return NextResponse.json({ error: 'Predictor service unavailable.' }, { status: 503 });
  }
}
