import { NextRequest, NextResponse } from 'next/server';
import { usersAdapter } from '@/lib/adapters/users';
import { signToken, COOKIE_NAME, EXPIRY_SECS } from '@/lib/auth/jwt';

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json() as {
      name: string; email: string; password: string;
    };

    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    // Check duplicate
    const existing = await usersAdapter.getByEmail(email.trim());
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }

    const user = await usersAdapter.register({ name: name.trim(), email: email.trim(), password });

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
    console.error('[POST /api/auth/register]', err);
    return NextResponse.json({ error: 'Registration failed.' }, { status: 500 });
  }
}
