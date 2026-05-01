import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveServerSession } from '@/lib/auth/current-user';
import { proxyRouteToMacMini, shouldForceMacMiniProxy } from '@/lib/server/mac-mini-proxy';
import { env } from '@/lib/env';

export async function GET(req: NextRequest) {
  if (shouldForceMacMiniProxy(req) || (!env.DATABASE_URL && env.MAC_MINI_API_BASE_URL)) {
    return proxyRouteToMacMini(req);
  }

  const session = await getEffectiveServerSession();
  return NextResponse.json({ user: session });
}
