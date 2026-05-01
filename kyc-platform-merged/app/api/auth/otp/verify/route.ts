import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyOTPChallenge } from '@/lib/auth/email-otp';
import { usersAdapter } from '@/lib/adapters/users';
import { COOKIE_NAME, cookieOptions, createServerSessionToken, sessionPayloadFromUser } from '@/lib/auth/jwt';
import { checkRateLimit, getClientId, LIMITS } from '@/lib/ratelimit';
import { AuthStoreUnavailableError } from '@/lib/adapters/users';
import { proxyRouteToMacMini } from '@/lib/server/mac-mini-proxy';
import { env } from '@/lib/env';

const BodySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  challenge_token: z.string().min(1),
});

export async function POST(req: NextRequest) {
  if (!env.DATABASE_URL && env.MAC_MINI_API_BASE_URL) {
    return proxyRouteToMacMini(req);
  }

  const rl = checkRateLimit(getClientId(req), 'email-otp-verify', LIMITS.auth);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many verification attempts. Please try again shortly.' }, { status: 429 });
  }

  try {
    const body = BodySchema.parse(await req.json());
    const verified = await verifyOTPChallenge(body.challenge_token, body.code);

    const user = await usersAdapter.findOrCreateAuthUser({
      email: verified.email,
      name: verified.name ?? verified.email.split('@')[0],
      method: 'email',
    });

    const payload = sessionPayloadFromUser(user);
    const sessionToken = await createServerSessionToken(payload, {
      userId: user._id,
      ipAddress: req.headers.get('x-forwarded-for'),
      userAgent: req.headers.get('user-agent'),
    });
    const res = NextResponse.json({ ok: true, user: payload });
    res.cookies.set(COOKIE_NAME, sessionToken.token, cookieOptions(sessionToken.expiresAt));
    return res;
  } catch (error) {
    console.error('[POST /api/auth/otp/verify]', error);
    if (error instanceof AuthStoreUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid verification code.' }, { status: 400 });
  }
}
