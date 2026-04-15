import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictor } from '@/lib/auth/entitlement';
import { getRecords, filterRecords, buildSummary, filtersFromQuery } from '@/lib/mandi/engine';
import { buildSeedSummary, getSeedRecords } from '@/lib/forecasting/data/seed';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!canAccessPredictor(session)) {
    return NextResponse.json({ error: 'Premium access required.' }, { status: 403 });
  }

  const q: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => { q[k] = v; });

  try {
    const filters = filtersFromQuery(q);
    const seedRecords = getSeedRecords(filters);
    if (seedRecords.length) {
      return NextResponse.json(buildSeedSummary(filters));
    }

    const { records, fetchedAt } = await getRecords();
    const filtered = filterRecords(records, filters);
    return NextResponse.json(buildSummary(filtered, fetchedAt));
  } catch {
    return NextResponse.json({ error: 'Predictor service unavailable.' }, { status: 503 });
  }
}
