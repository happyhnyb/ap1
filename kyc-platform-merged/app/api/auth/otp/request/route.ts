import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientId, LIMITS } from '@/lib/ratelimit';
import { usersAdapter } from '@/lib/adapters/users';
import { createOTPChallenge, sendOTPEmail } from '@/lib/auth/email-otp';
import { env } from '@/lib/env';
import { AuthStoreUnavailableError } from '@/lib/adapters/users';

const BodySchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase()),
  name: z.string().trim().min(2).max(80).optional(),
  intent: z.enum(['login', 'register']),
});

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(getClientId(req), 'email-otp', LIMITS.auth);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many OTP requests. Please wait and try again.' }, { status: 429 });
  }

  try {
    const body = BodySchema.parse(await req.json());
    const existing = await usersAdapter.getByEmail(body.email);

    if (body.intent === 'login' && !existing) {
      return NextResponse.json({ error: 'No account exists for this email yet.' }, { status: 404 });
    }

    if (body.intent === 'register' && existing) {
      return NextResponse.json({ error: 'An account with this email already exists. Use sign in instead.' }, { status: 409 });
    }

    const challenge = await createOTPChallenge({
      email: body.email,
      name: body.name ?? existing?.name ?? null,
      intent: body.intent,
    });

    await sendOTPEmail({
      email: body.email,
      code: challenge.code,
      intent: body.intent,
      name: body.name ?? existing?.name ?? null,
    });

    return NextResponse.json({
      ok: true,
      challenge_token: challenge.token,
      expires_in_sec: challenge.expiresInSec,
      dev_preview_code: env.IS_DEMO ? challenge.code : undefined,
    });
  } catch (error) {
    console.error('[POST /api/auth/otp/request]', error);
    if (error instanceof AuthStoreUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not send verification code.' }, { status: 400 });
  }
}
