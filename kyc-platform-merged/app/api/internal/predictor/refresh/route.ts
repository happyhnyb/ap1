import { NextRequest, NextResponse } from 'next/server';
import { refreshPredictorData } from '@/lib/predictor/refresh';
import { getInternalApiAuthError, isInternalApiRequestAuthorized } from '@/lib/server/internal-auth';

export async function POST(req: NextRequest) {
  if (!isInternalApiRequestAuthorized(req)) {
    return NextResponse.json(getInternalApiAuthError(), { status: 401 });
  }

  try {
    const data = await refreshPredictorData();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[POST /api/internal/predictor/refresh]', error);
    return NextResponse.json({ error: 'Predictor refresh failed.' }, { status: 500 });
  }
}
