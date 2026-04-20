/**
 * GET /api/forecast
 *
 * Returns the champion model's forecast for a commodity + market.
 * Uses rolling-origin cross-validation to select the best model automatically.
 *
 * Query parameters:
 *   commodity  (required) — e.g. "Wheat", "Onion"
 *   state      (optional) — e.g. "Punjab"
 *   market     (optional) — e.g. "Amritsar"
 *   district   (optional)
 *   horizon    (optional) — 1–14 (default 14)
 *
 * Auth: Controlled by predictor release mode.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { forecastingEngine } from '@/lib/forecasting/engine';
import { fallbackForecastResponse } from '@/lib/forecasting/fallback';
import { canAccessPredictorRelease, predictorAccessError, PREDICTOR_DISCLAIMER } from '@/lib/product/predictor';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!canAccessPredictorRelease(session)) {
    return NextResponse.json({ error: predictorAccessError(session) }, { status: 403 });
  }

  const q = Object.fromEntries(req.nextUrl.searchParams);
  const commodity = q.commodity?.trim();
  if (!commodity) {
    return NextResponse.json({ error: 'commodity query parameter is required.' }, { status: 400 });
  }

  const horizon = q.horizon ? Math.min(14, Math.max(1, parseInt(q.horizon, 10))) : 14;
  const query = {
    commodity,
    state:     q.state    || undefined,
    market:    q.market   || undefined,
    district:  q.district || undefined,
    horizon,
  };

  try {
    const result = await Promise.race([
      forecastingEngine.forecast(query),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('forecast timeout')), 3000)),
    ]);
    if (result.insufficient) {
      const fallback = await fallbackForecastResponse(query);
      fallback.meta.disclaimer = PREDICTOR_DISCLAIMER;
      return NextResponse.json(fallback);
    }
    result.meta.disclaimer = PREDICTOR_DISCLAIMER;
    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/forecast] primary engine failed, using fast fallback', err);
    try {
      const fallback = await fallbackForecastResponse({
        commodity,
        state: q.state || undefined,
        market: q.market || undefined,
        district: q.district || undefined,
        horizon,
      });
      fallback.meta.disclaimer = PREDICTOR_DISCLAIMER;
      return NextResponse.json(fallback);
    } catch (fallbackError) {
      console.error('[/api/forecast] fallback failed', fallbackError);
      return NextResponse.json({ error: 'Forecasting service temporarily unavailable.' }, { status: 503 });
    }
  }
}
