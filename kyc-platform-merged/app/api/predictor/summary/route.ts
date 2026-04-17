import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictorRelease, predictorAccessError } from '@/lib/product/predictor';
import { getRecords, filterRecords, buildSummary, filtersFromQuery } from '@/lib/mandi/engine';
import { buildSeedSummary, getSeedRecords } from '@/lib/forecasting/data/seed';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!canAccessPredictorRelease(session)) {
    return NextResponse.json({ error: predictorAccessError(session) }, { status: 403 });
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
