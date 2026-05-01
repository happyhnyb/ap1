import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { usersAdapter } from '@/lib/adapters/users';
import { checkRateLimit, getClientId, LIMITS } from '@/lib/ratelimit';
import { env } from '@/lib/env';
import { proxyRouteToMacMini } from '@/lib/server/mac-mini-proxy';
import { createPasswordResetToken, sendPasswordResetEmail } from '@/lib/auth/password-reset';

const BodySchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase()),
});

function getSiteBaseUrl(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const configured = env.APP_BASE_URL || env.BASE_URL;
  return (configured || origin).replace(/\/$/, '');
}

export async function POST(req: NextRequest) {
  if (!env.DATABASE_URL && env.MAC_MINI_API_BASE_URL) {
    return proxyRouteToMacMini(req);
  }

  const rl = checkRateLimit(getClientId(req), 'forgot-password', LIMITS.auth);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many password reset requests. Please wait and try again.' }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  const user = await usersAdapter.getByEmail(parsed.data.email);
  if (!user) {
    return NextResponse.json({
      ok: true,
      message: 'If that email exists, we have sent a password reset link.',
    });
  }

  const token = await createPasswordResetToken(user);
  const resetUrl = `${getSiteBaseUrl(req)}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}`;

  try {
    const result = await sendPasswordResetEmail({
      email: user.email,
      resetUrl,
      name: user.name,
    });

    return NextResponse.json({
      ok: true,
      message: 'If that email exists, we have sent a password reset link.',
      ...(result.delivered ? {} : { reset_url: resetUrl }),
    });
  } catch (error) {
    console.error('[POST /api/auth/forgot-password]', error);
    return NextResponse.json({ error: 'Unable to send password reset email right now. Please try again shortly.' }, { status: 503 });
  }
}
