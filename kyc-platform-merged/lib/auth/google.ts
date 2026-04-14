import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '@/lib/env';

const googleJWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export async function verifyGoogleCredential(idToken: string) {
  if (!env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
    throw new Error('Google OAuth is not configured.');
  }

  const { payload } = await jwtVerify(idToken, googleJWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  });

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
  const name = typeof payload.name === 'string' ? payload.name : email.split('@')[0] || 'Google User';
  const emailVerified = payload.email_verified === true;

  if (!email || !emailVerified) {
    throw new Error('Google account email could not be verified.');
  }

  return {
    email,
    name,
    picture: typeof payload.picture === 'string' ? payload.picture : null,
    subject: typeof payload.sub === 'string' ? payload.sub : '',
  };
}
