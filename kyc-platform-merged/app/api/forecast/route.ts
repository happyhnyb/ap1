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
 * Auth: Premium required.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { isPremiumUser } from '@/lib/auth/entitlement';
import { usersAdapter } from '@/lib/adapters';
import { forecastingEngine } from '@/lib/forecasting/engine';
import { fallbackForecastResponse } from '@/lib/forecasting/fallback';

export const maxDuration = 60;

async function checkPremium(): Promise<boolean> {
  const session = await getServerSession();
  if (!session) return false;
  const hasSessionAccess = session.role === 'admin'
    || session.role === 'editor'
    || (session.role === 'premium' && session.sub_status === 'active');
  if (hasSessionAccess) return true;
  try {
    const user = await usersAdapter.getByEmail(session.email);
    return isPremiumUser(user);
  } catch {
    return hasSessionAccess;
  }
}

export async function GET(req: NextRequest) {
  if (!await checkPremium()) {
    return NextResponse.json({ error: 'Premium access required.' }, { status: 403 });
  }

  const q = Object.fromEntries(req.nextUrl.searchParams);
  const commodity = q.commodity?.trim();
  if (!commodity) {
    return NextResponse.json({ error: 'commodity query parameter is required.' }, { status: 400 });
  }

  const horizon = q.horizon ? Math.min(14, Math.max(1, parseInt(q.horizon, 10))) : 14;

  try {
    const query = {
      commodity,
      state:     q.state    || undefined,
      market:    q.market   || undefined,
      district:  q.district || undefined,
      horizon,
    };
    const result = await Promise.race([
      forecastingEngine.forecast(query),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('forecast timeout')), 12000)),
    ]);
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
      return NextResponse.json(fallback);
    } catch (fallbackError) {
      console.error('[/api/forecast] fallback failed', fallbackError);
      return NextResponse.json({ error: 'Forecasting service temporarily unavailable.' }, { status: 503 });
    }
  }
}
