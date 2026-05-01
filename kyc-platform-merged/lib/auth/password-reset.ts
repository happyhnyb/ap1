import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '@/lib/env';
import type { User } from '@/types/user';

const PASSWORD_RESET_EXPIRY_SECS = 60 * 60;

type PasswordResetPayload = {
  purpose: 'password-reset';
  email: string;
  password_fingerprint: string;
};

function passwordResetSecret() {
  return new TextEncoder().encode(env.JWT_SECRET);
}

function passwordFingerprint(passwordHash: string | null | undefined) {
  return createHash('sha256').update(passwordHash ?? '').digest('hex');
}

export async function createPasswordResetToken(user: User) {
  return new SignJWT({
    purpose: 'password-reset',
    email: user.email.toLowerCase(),
    password_fingerprint: passwordFingerprint(user.password_hash),
  } satisfies PasswordResetPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${PASSWORD_RESET_EXPIRY_SECS}s`)
    .sign(passwordResetSecret());
}

export async function verifyPasswordResetToken(token: string, user: User) {
  const { payload } = await jwtVerify(token, passwordResetSecret());
  const typed = payload as unknown as PasswordResetPayload;

  if (typed.purpose !== 'password-reset') {
    throw new Error('Invalid password reset token.');
  }

  if (typed.email !== user.email.toLowerCase()) {
    throw new Error('This reset link does not match the selected account.');
  }

  if (typed.password_fingerprint !== passwordFingerprint(user.password_hash)) {
    throw new Error('This reset link has already been used or is no longer valid.');
  }
}

export async function sendPasswordResetEmail(input: {
  email: string;
  resetUrl: string;
  name?: string | null;
}) {
  if (!env.RESEND_API_KEY) {
    if (env.IS_DEV) return { delivered: false };
    throw new Error('Password reset email is not configured. Set RESEND_API_KEY.');
  }

  const displayName = input.name?.trim() || 'there';
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
      <h2 style="margin:0 0 12px">Know Your Commodity</h2>
      <p style="margin:0 0 12px">Hi ${displayName},</p>
      <p style="margin:0 0 16px">We received a request to reset your password.</p>
      <p style="margin:0 0 18px">
        <a href="${input.resetUrl}" style="display:inline-block;background:#2f6f4f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Reset password</a>
      </p>
      <p style="margin:0 0 12px">This link expires in 1 hour.</p>
      <p style="margin:0;color:#666;font-size:13px">If you did not request this, you can safely ignore this email.</p>
    </div>
  `.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.PASSWORD_RESET_FROM_EMAIL,
      to: [input.email],
      subject: 'Reset your KYC Agri password',
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to send password reset email: ${text}`);
  }

  return { delivered: true };
}
