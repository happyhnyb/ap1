import { cookies, headers } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '@/lib/env';
import type { User } from '@/types/user';
import { getUserBySessionToken, revokeSessionToken, rotateSessionToken } from '@/lib/db/repositories/users';
import { shouldProxyToMacMini } from '@/lib/server/mac-mini';

export interface SessionPayload {
  _id: string;
  name: string;
  email: string;
  role: 'user' | 'editor' | 'admin';
  plan: 'free' | 'monthly' | 'annual';
  sub_status: 'active' | 'expired' | 'cancelled' | 'none';
}

export const COOKIE_NAME = 'kyc_session';
export const EXPIRY_SECS = 60 * 60 * 24 * 7;

const IS_PROD = process.env.NODE_ENV === 'production';
const isLocalhostSite = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(env.BASE_URL || '');

function getJwtSecret() {
  return new TextEncoder().encode(env.JWT_SECRET);
}

function useLocalJwtSessions() {
  return !env.DATABASE_URL && !env.MAC_MINI_API_BASE_URL;
}

export function sessionPayloadFromUser(user: User): SessionPayload {
  const role = user.role === 'admin' || user.role === 'editor' ? user.role : 'user';
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role,
    plan: user.subscription.plan,
    sub_status: user.subscription.status,
  };
}

export function cookieOptions(expiresAt?: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: IS_PROD && !isLocalhostSite,
    maxAge: EXPIRY_SECS,
    path: '/',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    ...(expiresAt ? { expires: expiresAt } : {}),
  } as const;
}

async function getCookieToken() {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

async function getCurrentRequestOrigin() {
  const headerStore = await headers();
  const host = headerStore.get('x-forwarded-host') || headerStore.get('host') || '';
  const proto = headerStore.get('x-forwarded-proto') || (host.includes('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  if (!host) return null;
  return `${proto}://${host}`;
}

async function readProxySession() {
  const token = await getCookieToken();
  if (!token || !env.MAC_MINI_API_BASE_URL) return null;

  const requestOrigin = await getCurrentRequestOrigin().catch(() => null);
  const targetBase = (requestOrigin || env.MAC_MINI_API_BASE_URL).replace(/\/$/, '');

  const response = await fetch(`${targetBase}/api/auth/me`, {
    method: 'GET',
    headers: {
      cookie: `${COOKIE_NAME}=${token}`,
    },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null) as { user?: SessionPayload | null } | null;
  return payload?.user ?? null;
}

async function signLocalSession(payload: SessionPayload) {
  const expiresAt = new Date(Date.now() + EXPIRY_SECS * 1000);
  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getJwtSecret());

  return { token, expiresAt };
}

async function readLocalSession(token: string): Promise<SessionPayload | null> {
  try {
    const verified = await jwtVerify(token, getJwtSecret());
    const payload = verified.payload as Partial<SessionPayload>;
    if (!payload._id || !payload.email || !payload.name) return null;
    return {
      _id: payload._id,
      email: payload.email,
      name: payload.name,
      role: payload.role === 'admin' || payload.role === 'editor' ? payload.role : 'user',
      plan: payload.plan === 'monthly' || payload.plan === 'annual' ? payload.plan : 'free',
      sub_status: payload.sub_status === 'active' || payload.sub_status === 'expired' || payload.sub_status === 'cancelled' ? payload.sub_status : 'none',
    };
  } catch {
    return null;
  }
}

// Test-friendly wrappers for local JWT session encoding/decoding.
export async function signToken(payload: SessionPayload) {
  const { token } = await signLocalSession(payload);
  return token;
}

export async function verifyToken(token: string) {
  return readLocalSession(token);
}

export async function getServerSession(): Promise<SessionPayload | null> {
  if (shouldProxyToMacMini() && !env.DATABASE_URL) {
    return readProxySession();
  }

  const token = await getCookieToken();
  if (!token) return null;
  if (useLocalJwtSessions()) {
    return readLocalSession(token);
  }
  const user = await getUserBySessionToken(token).catch(() => null);
  return user ? sessionPayloadFromUser(user) : null;
}

export async function createServerSessionToken(payload: SessionPayload, input?: {
  userId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  if (useLocalJwtSessions()) {
    return signLocalSession(payload);
  }

  const { createSession } = await import('@/lib/db/repositories/users');
  return createSession({
    userId: input?.userId ?? payload._id,
    ipAddress: input?.ipAddress,
    userAgent: input?.userAgent,
  });
}

export async function refreshServerSessionToken() {
  const token = await getCookieToken();
  if (!token) return null;
  if (useLocalJwtSessions()) {
    const session = await readLocalSession(token);
    if (!session) return null;
    return signLocalSession(session);
  }
  return rotateSessionToken(token).catch(() => null);
}

export async function clearServerSessionToken() {
  const token = await getCookieToken();
  if (!token) return;
  if (useLocalJwtSessions()) return;
  await revokeSessionToken(token).catch(() => undefined);
}
