import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import type { User } from '@/types/user';

export interface SessionPayload {
  _id:        string;
  name:       string;
  email:      string;
  role:       'reader' | 'premium' | 'editor' | 'admin';
  plan:       'free' | 'monthly' | 'annual';
  sub_status: 'active' | 'expired' | 'cancelled' | 'none';
}

export const COOKIE_NAME = 'kyc_token';
export const EXPIRY_SECS = 60 * 60 * 24 * 7; // 7 days

const IS_PROD = process.env.NODE_ENV === 'production';

/** Lazily encoded so env validation fires at call-time, not module-load-time in tests. */
function getSecret(): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${EXPIRY_SECS}s`)
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** Read and verify session from the request cookie (server-side only). */
export async function getServerSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function sessionPayloadFromUser(user: User): SessionPayload {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    plan: user.subscription.plan,
    sub_status: user.subscription.status,
  };
}

/** Cookie options — secure flag on in production. */
export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure:   IS_PROD,
    maxAge:   EXPIRY_SECS,
    path:     '/',
  } as const;
}
