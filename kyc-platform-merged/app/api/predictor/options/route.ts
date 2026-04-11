import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictor } from '@/lib/auth/entitlement';
import { predictorClient } from '@/lib/predictor/client';

export async function GET() {
  const session = await getServerSession();
  if (!canAccessPredictor(session)) {
    return NextResponse.json({ error: 'Premium access required.' }, { status: 403 });
  }

  try {
    const data = await predictorClient.options();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Predictor service unavailable.' }, { status: 503 });
  }
}
