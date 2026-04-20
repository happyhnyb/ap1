import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictorRelease, predictorAccessError } from '@/lib/product/predictor';
import { buildOptions } from '@/lib/mandi/engine';
import { buildSeedOptions } from '@/lib/forecasting/data/seed';
import { loadRecords } from '@/lib/forecasting/data/loader';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const session = await getServerSession();
  if (!canAccessPredictorRelease(session)) {
    return NextResponse.json({ error: predictorAccessError(session) }, { status: 403 });
  }

  try {
    const { records } = await loadRecords();
    if (records.length) {
      return NextResponse.json(buildOptions(records));
    }
  } catch (error) {
    console.error('[/api/predictor/options] falling back to seed options', error);
  }

  const seedOptions = buildSeedOptions();
  if (seedOptions.commodities.length) {
    return NextResponse.json(seedOptions);
  }

  return NextResponse.json({ error: 'Predictor options unavailable.' }, { status: 503 });
}
