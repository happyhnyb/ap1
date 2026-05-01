import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictorRelease, predictorAccessError } from '@/lib/product/predictor';
import { filtersFromQuery } from '@/lib/mandi/engine';
import { getPredictorSummaryData } from '@/lib/predictor/summary-data';
import { proxyRouteToMacMini, shouldForceMacMiniProxy } from '@/lib/server/mac-mini-proxy';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  if (shouldForceMacMiniProxy(req)) {
    return proxyRouteToMacMini(req);
  }

  const session = await getServerSession();
  if (!canAccessPredictorRelease(session)) {
    return NextResponse.json({ error: predictorAccessError(session) }, { status: 403 });
  }

  const q: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => { q[k] = v; });

  try {
    const filters = filtersFromQuery(q);
    return NextResponse.json(await getPredictorSummaryData(filters));
  } catch {
    return NextResponse.json({ error: 'Predictor service unavailable.' }, { status: 503 });
  }
}
