import { NextRequest, NextResponse } from 'next/server';
import { usersAdapter } from '@/lib/adapters/users';
import { signToken, COOKIE_NAME, cookieOptions, sessionPayloadFromUser } from '@/lib/auth/jwt';
import { parseBody, LoginSchema } from '@/lib/validation';
import { checkRateLimit, getClientId, LIMITS } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(getClientId(req), 'login', LIMITS.auth);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please wait before trying again.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const parsed = await parseBody(LoginSchema, req);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { email, password } = parsed.data;

  try {
    const user = await usersAdapter.login(email, password);
    if (!user) {
      // Same message for wrong email and wrong password — prevents account enumeration
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const payload = sessionPayloadFromUser(user);
    const token = await signToken(payload);
    const res = NextResponse.json({ ok: true, user: payload });
    res.cookies.set(COOKIE_NAME, token, cookieOptions());
    return res;
  } catch (err) {
    console.error('[POST /api/auth/login]', err);
    return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 });
  }
}
