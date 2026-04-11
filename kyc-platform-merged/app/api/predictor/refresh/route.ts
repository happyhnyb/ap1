import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { isAdmin } from '@/lib/auth/entitlement';
import { revalidatePath } from 'next/cache';

export async function POST() {
  const session = await getServerSession();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  // Invalidate all predictor routes so next request re-fetches from Agmarknet
  revalidatePath('/api/predictor/options');
  revalidatePath('/api/predictor/summary');
  revalidatePath('/api/predictor/history');
  revalidatePath('/api/predictor/forecast');
  return NextResponse.json({ ok: true, message: 'Cache cleared — data will refresh on next request.' });
}
