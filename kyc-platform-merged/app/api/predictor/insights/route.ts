import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictor } from '@/lib/auth/entitlement';
import { predictorClient } from '@/lib/predictor/client';

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!canAccessPredictor(session)) {
    return NextResponse.json({ error: 'Premium access required.' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const filters: Record<string, string> = {};
  ['commodity', 'state', 'district', 'market'].forEach((k) => {
    const v = searchParams.get(k);
    if (v) filters[k] = v;
  });

  try {
    const data = await predictorClient.insights(filters);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Insights service unavailable.' }, { status: 503 });
  }
}
