import { env } from '@/lib/env';

type SendEmailInput = {
  from?: string;
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
};

function normalizeRecipients(raw: string) {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getContactNotificationRecipients() {
  return normalizeRecipients(env.CONTACT_EMAIL);
}

export async function sendResendEmail(input: SendEmailInput) {
  if (!env.RESEND_API_KEY) {
    if (env.IS_DEV) return { delivered: false };
    throw new Error('Email delivery is not configured. Set RESEND_API_KEY.');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from || env.RESEND_FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to send email: ${text}`);
  }

  return { delivered: true };
}
