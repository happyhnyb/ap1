import { NextRequest, NextResponse } from 'next/server';
import { clearServerSessionToken, COOKIE_NAME } from '@/lib/auth/jwt';
import { proxyRouteToMacMini, shouldForceMacMiniProxy } from '@/lib/server/mac-mini-proxy';
import { env } from '@/lib/env';

export async function POST(req: NextRequest) {
  if (shouldForceMacMiniProxy(req) || (!env.DATABASE_URL && env.MAC_MINI_API_BASE_URL)) {
    return proxyRouteToMacMini(req);
  }

  await clearServerSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME);
  return res;
}
