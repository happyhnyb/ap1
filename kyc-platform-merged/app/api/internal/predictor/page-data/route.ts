import { NextRequest, NextResponse } from 'next/server';
import { getPredictorPageData } from '@/lib/predictor/page-data';
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
    const data = await getPredictorPageData(params);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[GET /api/internal/predictor/page-data]', error);
    return NextResponse.json({ error: 'Predictor page data unavailable.' }, { status: 503 });
  }
}
