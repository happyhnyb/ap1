import { NextResponse } from 'next/server';
import { getEffectiveServerSession } from '@/lib/auth/current-user';
import { NextRequest } from 'next/server';
import { proxyRouteToMacMini } from '@/lib/server/mac-mini-proxy';
import { env } from '@/lib/env';

export async function GET(req: NextRequest) {
  if (!env.DATABASE_URL && env.MAC_MINI_API_BASE_URL) {
    return proxyRouteToMacMini(req);
  }

  const session = await getEffectiveServerSession();
  if (!session) return NextResponse.json({ user: null });
  return NextResponse.json({ user: session });
}
