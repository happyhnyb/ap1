/**
 * One-time demo login — sets a signed premium session cookie.
 * Protected by DEMO_LOGIN_SECRET env var.
 * DELETE THIS FILE once the real MongoDB auth is fixed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { signToken, COOKIE_NAME, cookieOptions } from '@/lib/auth/jwt';

export async function GET(req: NextRequest) {
  const secret = process.env.DEMO_LOGIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Not available.' }, { status: 404 });
  }

  const provided = req.nextUrl.searchParams.get('secret');
  if (!provided || provided !== secret.trim()) {
    return NextResponse.json({ error: 'Invalid secret.' }, { status: 401 });
  }

  const token = await signToken({
    _id:        'demo-dhairya-001',
    name:       'Dhairya',
    email:      'dhairya@hnyb.in',
    role:       'admin',
    plan:       'annual',
    sub_status: 'active',
  });

  const res = NextResponse.redirect(new URL('/premium/predictor', req.url));
  res.cookies.set(COOKIE_NAME, token, cookieOptions());
  return res;
}
