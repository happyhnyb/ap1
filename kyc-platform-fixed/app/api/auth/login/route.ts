import { NextRequest, NextResponse } from 'next/server';
import { usersAdapter } from '@/lib/adapters/users';
import { signToken, COOKIE_NAME, EXPIRY_SECS } from '@/lib/auth/jwt';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json() as { email: string; password: string };

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const user = await usersAdapter.login(email.trim(), password);
    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const payload = {
      _id:        user._id,
      name:       user.name,
      email:      user.email,
      role:       user.role,
      plan:       user.subscription.plan,
      sub_status: user.subscription.status,
    } as const;

    const token = await signToken(payload);

    const res = NextResponse.json({ ok: true, user: payload });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure:   process.env.NODE_ENV === 'production',
      maxAge:   EXPIRY_SECS,
      path:     '/',
    });
    return res;
  } catch (err) {
    console.error('[POST /api/auth/login]', err);
    return NextResponse.json({ error: 'Login failed.' }, { status: 500 });
  }
}
