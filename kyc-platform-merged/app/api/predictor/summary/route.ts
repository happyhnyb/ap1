import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictorRelease, predictorAccessError } from '@/lib/product/predictor';
import { filterRecords, buildSummary, filtersFromQuery } from '@/lib/mandi/engine';
import { buildSeedSummary, getSeedRecords } from '@/lib/forecasting/data/seed';
import { loadRecords } from '@/lib/forecasting/data/loader';

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
    const { records, fetchedAt } = await loadRecords({ commodity: filters.commodity, state: filters.state, market: filters.market });
    const filtered = filterRecords(records, filters);
    if (filtered.length) {
      return NextResponse.json(buildSummary(filtered, fetchedAt));
    }

    const seedRecords = getSeedRecords(filters);
    if (seedRecords.length) return NextResponse.json(buildSeedSummary(filters));
    return NextResponse.json({ error: 'Predictor service unavailable.' }, { status: 503 });
  } catch {
    return NextResponse.json({ error: 'Predictor service unavailable.' }, { status: 503 });
  }
}
