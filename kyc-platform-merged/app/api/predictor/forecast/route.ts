import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { isPremiumUser } from '@/lib/auth/entitlement';
import { predictorClient } from '@/lib/predictor/client';
import { usersAdapter } from '@/lib/adapters';

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Premium access required.' }, { status: 403 });
  }
  // Fresh DB check — catches subscription changes since token issuance.
  // Falls back to JWT claim if DB is temporarily unreachable.
  try {
    const user = await usersAdapter.getByEmail(session.email);
    if (!isPremiumUser(user)) {
      return NextResponse.json({ error: 'Premium access required.' }, { status: 403 });
    }
  } catch {
    // DB unavailable — fall back to JWT role claim
    if (!['admin', 'editor', 'premium'].includes(session.role) || session.sub_status !== 'active') {
      return NextResponse.json({ error: 'Premium access required.' }, { status: 403 });
    }
  }

  const { searchParams } = req.nextUrl;
  const filters: Record<string, string> = {};
  ['commodity', 'state', 'district', 'market', 'horizon'].forEach((k) => {
    const v = searchParams.get(k);
    if (v) filters[k] = v;
  });

  try {
    const data = await predictorClient.forecast(filters);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Predictor service unavailable.' }, { status: 503 });
  }
}
