/**
 * GET /api/forecast/quality
 *
 * Returns data quality report for a commodity + market series:
 *   - Missing/stale/outlier/zero day counts
 *   - Backtest metrics per model
 *   - Recommended model
 *   - Warnings (high imputation ratio, stale data, etc.)
 *
 * Auth: Controlled by predictor release mode.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { forecastingEngine } from '@/lib/forecasting/engine';
import { fallbackQualityResponse } from '@/lib/forecasting/fallback';
import { canAccessPredictorRelease, predictorAccessError } from '@/lib/product/predictor';

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

  try {
    const query = {
      commodity,
      state:    q.state    || undefined,
      market:   q.market   || undefined,
      district: q.district || undefined,
    };
    const result = await Promise.race([
      forecastingEngine.quality(query),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('quality timeout')), 3000)),
    ]);
    if (result.data_quality.real_days === 0) {
      return NextResponse.json(await fallbackQualityResponse(query));
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/forecast/quality] primary engine failed, using fast fallback', err);
    try {
      const fallback = await fallbackQualityResponse({
        commodity,
        state: q.state || undefined,
        market: q.market || undefined,
        district: q.district || undefined,
      });
      return NextResponse.json(fallback);
    } catch (fallbackError) {
      console.error('[/api/forecast/quality] fallback failed', fallbackError);
      return NextResponse.json({ error: 'Quality check unavailable.' }, { status: 503 });
    }
  }
}
