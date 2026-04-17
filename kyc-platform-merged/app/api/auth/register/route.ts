import { NextRequest, NextResponse } from 'next/server';
import { usersAdapter } from '@/lib/adapters/users';
import { signToken, COOKIE_NAME, cookieOptions, sessionPayloadFromUser } from '@/lib/auth/jwt';
import { parseBody, RegisterSchema } from '@/lib/validation';
import { checkRateLimit, getClientId, LIMITS } from '@/lib/ratelimit';
import { AuthStoreUnavailableError } from '@/lib/adapters/users';

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(getClientId(req), 'register', LIMITS.auth);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many registration attempts. Please wait before trying again.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const parsed = await parseBody(RegisterSchema, req);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { name, email, password } = parsed.data;

  try {
    const existing = await usersAdapter.getByEmail(email);
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }

    const user = await usersAdapter.register({ name, email, password });

    const payload = sessionPayloadFromUser(user);
    const token = await signToken(payload);
    const res = NextResponse.json({ ok: true, user: payload });
    res.cookies.set(COOKIE_NAME, token, cookieOptions());
    return res;
  } catch (err) {
    console.error('[POST /api/auth/register]', err);
    if (err instanceof AuthStoreUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}
