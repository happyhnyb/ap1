import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyGoogleCredential } from '@/lib/auth/google';
import { usersAdapter } from '@/lib/adapters/users';
import { signToken, COOKIE_NAME, cookieOptions, sessionPayloadFromUser } from '@/lib/auth/jwt';
import { checkRateLimit, getClientId, LIMITS } from '@/lib/ratelimit';
import { AuthStoreUnavailableError } from '@/lib/adapters/users';

const BodySchema = z.object({
  credential: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(getClientId(req), 'google-auth', LIMITS.auth);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many sign-in attempts. Please try again shortly.' }, { status: 429 });
  }

  try {
    const body = BodySchema.parse(await req.json());
    const googleUser = await verifyGoogleCredential(body.credential);
    const user = await usersAdapter.findOrCreateAuthUser({
      email: googleUser.email,
      name: googleUser.name,
      method: 'google',
    });

    const payload = sessionPayloadFromUser(user);
    const token = await signToken(payload);
    const res = NextResponse.json({ ok: true, user: payload });
    res.cookies.set(COOKIE_NAME, token, cookieOptions());
    return res;
  } catch (error) {
    console.error('[POST /api/auth/google]', error);
    if (error instanceof AuthStoreUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Google sign-in failed.' }, { status: 400 });
  }
}
