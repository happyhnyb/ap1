import { NextResponse } from 'next/server';
import { usersAdapter } from '@/lib/adapters';
import { COOKIE_NAME, cookieOptions, getServerSession, refreshServerSessionToken, sessionPayloadFromUser } from '@/lib/auth/jwt';
import { proxyRouteToMacMini, shouldForceMacMiniProxy } from '@/lib/server/mac-mini-proxy';
import { env } from '@/lib/env';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  if (shouldForceMacMiniProxy(req) || (!env.DATABASE_URL && env.MAC_MINI_API_BASE_URL)) {
    return proxyRouteToMacMini(req);
  }

  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  const user = await usersAdapter.getByEmail(session.email);
  if (!user) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  const payload = sessionPayloadFromUser(user);
  const token = await refreshServerSessionToken();
  if (!token) {
    return NextResponse.json({ error: 'Session refresh failed.' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, user: payload });
  res.cookies.set(COOKIE_NAME, token.token, cookieOptions(token.expiresAt));
  return res;
}
