import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictor } from '@/lib/auth/entitlement';
import { predictorClient } from '@/lib/predictor/client';

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!canAccessPredictor(session)) {
    return NextResponse.json({ error: 'Premium required' }, { status: 403 });
  }
  const { searchParams } = req.nextUrl;
  const qs = searchParams.toString();
  try {
    const data = await predictorClient.fetch(`/api/insights?${qs}`);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Mandi service unavailable' }, { status: 503 });
  }
}
