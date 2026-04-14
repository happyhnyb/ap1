import { createHash, timingSafeEqual } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '@/lib/env';

type OTPIntent = 'login' | 'register';

interface OTPPayload {
  email: string;
  name: string | null;
  intent: OTPIntent;
  code_hash: string;
}

const OTP_EXPIRY_SECS = 60 * 10;

function otpSecret() {
  return new TextEncoder().encode(env.JWT_SECRET);
}

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

export function generateOTPCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createOTPChallenge(input: {
  email: string;
  name?: string | null;
  intent: OTPIntent;
}) {
  const code = generateOTPCode();
  const token = await new SignJWT({
    email: input.email.toLowerCase(),
    name: input.name?.trim() || null,
    intent: input.intent,
    code_hash: hashCode(code),
  } satisfies OTPPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${OTP_EXPIRY_SECS}s`)
    .sign(otpSecret());

  return {
    code,
    token,
    expiresInSec: OTP_EXPIRY_SECS,
  };
}

export async function verifyOTPChallenge(token: string, code: string) {
  const { payload } = await jwtVerify(token, otpSecret());
  const typed = payload as unknown as OTPPayload;
  const provided = Buffer.from(hashCode(code));
  const expected = Buffer.from(typed.code_hash);

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error('Invalid verification code.');
  }

  return {
    email: typed.email.toLowerCase(),
    name: typed.name ?? null,
    intent: typed.intent,
  };
}

export async function sendOTPEmail(input: {
  email: string;
  code: string;
  intent: OTPIntent;
  name?: string | null;
}) {
  if (!env.RESEND_API_KEY) {
    if (env.IS_DEV) return { delivered: false };
    throw new Error('Email OTP is not configured. Set RESEND_API_KEY.');
  }

  const subject = input.intent === 'register'
    ? 'Your KYC Agri sign-up code'
    : 'Your KYC Agri sign-in code';

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
      <h2 style="margin:0 0 12px">Know Your Commodity</h2>
      <p style="margin:0 0 12px">Use this one-time code to ${input.intent === 'register' ? 'create your account' : 'sign in'}.</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:6px;margin:18px 0">${input.code}</div>
      <p style="margin:0 0 12px">This code expires in 10 minutes.</p>
      <p style="margin:0;color:#666;font-size:13px">If you did not request this code, you can ignore this email.</p>
    </div>
  `.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [input.email],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to send OTP email: ${text}`);
  }

  return { delivered: true };
}
