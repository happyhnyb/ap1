import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { isAdmin } from '@/lib/auth/entitlement';

const MANDI_BASE = process.env.MANDI_SERVICE_URL || 'http://localhost:4000';

export async function POST() {
  const session = await getServerSession();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  try {
    const res = await fetch(`${MANDI_BASE}/api/refresh`, { method: 'POST' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Predictor service unavailable.' }, { status: 503 });
  }
}
