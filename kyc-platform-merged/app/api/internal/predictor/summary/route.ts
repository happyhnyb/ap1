import { NextRequest, NextResponse } from 'next/server';
import { filtersFromQuery } from '@/lib/mandi/engine';
import { getPredictorSummaryData } from '@/lib/predictor/summary-data';
import { getInternalApiAuthError, isInternalApiRequestAuthorized } from '@/lib/server/internal-auth';

export async function GET(req: NextRequest) {
  if (!isInternalApiRequestAuthorized(req)) {
    return NextResponse.json(getInternalApiAuthError(), { status: 401 });
  }

  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  try {
    const filters = filtersFromQuery(params);
    const data = await getPredictorSummaryData(filters);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[GET /api/internal/predictor/summary]', error);
    return NextResponse.json({ error: 'Predictor summary unavailable.' }, { status: 503 });
  }
}
