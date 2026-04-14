import { NextResponse } from 'next/server';
import { usersAdapter } from '@/lib/adapters';
import { COOKIE_NAME, cookieOptions, getServerSession, sessionPayloadFromUser, signToken } from '@/lib/auth/jwt';

export async function POST() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  const user = await usersAdapter.getByEmail(session.email);
  if (!user) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  const payload = sessionPayloadFromUser(user);
  const token = await signToken(payload);
  const res = NextResponse.json({ ok: true, user: payload });
  res.cookies.set(COOKIE_NAME, token, cookieOptions());
  return res;
}
