/**
 * GET /api/forecast/quality
 *
 * Returns data quality report for a commodity + market series:
 *   - Missing/stale/outlier/zero day counts
 *   - Backtest metrics per model
 *   - Recommended model
 *   - Warnings (high imputation ratio, stale data, etc.)
 *
 * Auth: Premium required.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { isPremiumUser } from '@/lib/auth/entitlement';
import { usersAdapter } from '@/lib/adapters';
import { forecastingEngine } from '@/lib/forecasting/engine';
import { fallbackQualityResponse } from '@/lib/forecasting/fallback';

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

  try {
    const query = {
      commodity,
      state:    q.state    || undefined,
      market:   q.market   || undefined,
      district: q.district || undefined,
    };
    const fast = await fallbackQualityResponse(query);
    if (fast.data_quality.real_days > 0) {
      return NextResponse.json(fast);
    }

    const result = await Promise.race([
      forecastingEngine.quality(query),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('quality timeout')), 3000)),
    ]);
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
