/**
 * GET /api/forecast/compare
 *
 * Returns all eligible models' forecasts and metrics side by side.
 * Champion is flagged. Use this for transparency and model debugging.
 *
 * Query parameters: same as /api/forecast
 * Auth: Premium required.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { isPremiumUser } from '@/lib/auth/entitlement';
import { usersAdapter } from '@/lib/adapters';
import { forecastingEngine } from '@/lib/forecasting/engine';

export const maxDuration = 90; // compare trains all models

async function checkPremium(): Promise<boolean> {
  const session = await getServerSession();
  if (!session) return false;
  try {
    const user = await usersAdapter.getByEmail(session.email);
    return isPremiumUser(user);
  } catch {
    return ['admin', 'editor', 'premium'].includes(session.role) && session.sub_status === 'active';
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
    const result = await forecastingEngine.compare({
      commodity,
      state:     q.state    || undefined,
      market:    q.market   || undefined,
      district:  q.district || undefined,
      horizon,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/forecast/compare]', err);
    return NextResponse.json({ error: 'Forecasting service temporarily unavailable.' }, { status: 503 });
  }
}
