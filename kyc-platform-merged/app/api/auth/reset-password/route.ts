import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { usersAdapter } from '@/lib/adapters/users';
import { env } from '@/lib/env';
import { proxyRouteToMacMini } from '@/lib/server/mac-mini-proxy';
import { verifyPasswordResetToken } from '@/lib/auth/password-reset';

const BodySchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase()),
  token: z.string().min(20),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export async function POST(req: NextRequest) {
  if (!env.DATABASE_URL && env.MAC_MINI_API_BASE_URL) {
    return proxyRouteToMacMini(req);
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message || 'Invalid password reset request.' }, { status: 400 });
  }

  const user = await usersAdapter.getByEmail(parsed.data.email);
  if (!user) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
  }

  try {
    await verifyPasswordResetToken(parsed.data.token, user);
    await usersAdapter.updatePassword(user._id, parsed.data.password);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[POST /api/auth/reset-password]', error);
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
  }
}
