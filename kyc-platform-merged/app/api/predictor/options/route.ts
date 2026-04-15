import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictor } from '@/lib/auth/entitlement';
import { getRecords, buildOptions } from '@/lib/mandi/engine';
import { buildSeedOptions } from '@/lib/forecasting/data/seed';

export const maxDuration = 60;

export async function GET() {
  const session = await getServerSession();
  if (!canAccessPredictor(session)) {
    return NextResponse.json({ error: 'Premium access required.' }, { status: 403 });
  }

  const seedOptions = buildSeedOptions();
  if (seedOptions.commodities.length) {
    return NextResponse.json(seedOptions);
  }

  const { records, apiConfigured, error } = await getRecords();

  if (!apiConfigured) {
    return NextResponse.json({ error: 'DATAGOV_API_KEY not configured on server.' }, { status: 503 });
  }
  if (error && records.length === 0) {
    return NextResponse.json({ error: `Failed to fetch market data: ${error}` }, { status: 503 });
  }

  return NextResponse.json(buildOptions(records));
}
