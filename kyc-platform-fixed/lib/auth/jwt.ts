import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export interface SessionPayload {
  _id:   string;
  name:  string;
  email: string;
  role:  'reader' | 'premium' | 'editor' | 'admin';
  plan:  'free' | 'monthly' | 'annual';
  sub_status: 'active' | 'expired' | 'cancelled' | 'none';
}

const COOKIE_NAME = 'kyc_token';
const JWT_SECRET  = new TextEncoder().encode(
  process.env.JWT_SECRET || 'kyc-dev-secret-change-in-production-please'
);
const EXPIRY_SECS = 60 * 60 * 24 * 7; // 7 days

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${EXPIRY_SECS}s`)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// Read session from cookie (server-side)
export async function getServerSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export { COOKIE_NAME, EXPIRY_SECS };
