import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { isAdmin } from '@/lib/auth/entitlement';
import { revalidateTag } from 'next/cache';
import { MANDI_CACHE_TAG } from '@/lib/mandi/engine';

export async function POST() {
  const session = await getServerSession();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  try {
    revalidateTag(MANDI_CACHE_TAG);
    return NextResponse.json({ ok: true, message: 'Cache invalidated — data will be re-fetched on next request.' });
  } catch {
    return NextResponse.json({ error: 'Refresh failed.' }, { status: 500 });
  }
}
