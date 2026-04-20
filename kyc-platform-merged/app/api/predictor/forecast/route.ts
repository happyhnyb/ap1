import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictorRelease, predictorAccessError, PREDICTOR_DISCLAIMER } from '@/lib/product/predictor';
import { forecastingEngine } from '@/lib/forecasting/engine';
import { fallbackForecastResponse } from '@/lib/forecasting/fallback';
import { toLegacyPredictorForecast } from '@/lib/forecasting/adapters/legacy';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!canAccessPredictorRelease(session)) {
    return NextResponse.json({ error: predictorAccessError(session) }, { status: 403 });
  }

  const query = Object.fromEntries(req.nextUrl.searchParams);
  const commodity = query.commodity?.trim();
  if (!commodity) {
    return NextResponse.json({ error: 'commodity query parameter is required.' }, { status: 400 });
  }

  const horizon = Math.min(30, Math.max(3, Number(query.horizon || 14)));
  const engineQuery = {
    commodity,
    state: query.state || undefined,
    market: query.market || undefined,
    district: query.district || undefined,
    horizon: Math.min(14, horizon),
  };

  try {
    const result = await forecastingEngine.forecast(engineQuery);
    if (result.insufficient) {
      const fallback = await fallbackForecastResponse(engineQuery);
      fallback.meta.disclaimer = PREDICTOR_DISCLAIMER;
      return NextResponse.json(toLegacyPredictorForecast(fallback));
    }
    result.meta.disclaimer = PREDICTOR_DISCLAIMER;
    return NextResponse.json(toLegacyPredictorForecast(result));
  } catch (error) {
    console.error('[/api/predictor/forecast]', error);
    try {
      const fallback = await fallbackForecastResponse(engineQuery);
      fallback.meta.disclaimer = PREDICTOR_DISCLAIMER;
      return NextResponse.json(toLegacyPredictorForecast(fallback));
    } catch (fallbackError) {
      console.error('[/api/predictor/forecast] fallback failed', fallbackError);
      return NextResponse.json({ error: 'Predictor service unavailable.' }, { status: 503 });
    }
  }
}
