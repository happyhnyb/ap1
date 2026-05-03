import nodemailer, { type Transporter } from 'nodemailer';
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

let cachedTransporter: Transporter | null = null;

function getGmailTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: env.GMAIL_USER,
      pass: env.GMAIL_APP_PASSWORD,
    },
  });
  return cachedTransporter;
}

async function sendViaGmail(input: SendEmailInput) {
  const transporter = getGmailTransporter();
  const fromAddress = input.from || env.EMAIL_FROM || env.GMAIL_USER;
  await transporter.sendMail({
    from: fromAddress,
    to: input.to.join(', '),
    subject: input.subject,
    html: input.html,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
  });
  return { delivered: true };
}

async function sendViaResend(input: SendEmailInput) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from || env.EMAIL_FROM,
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

export async function sendEmail(input: SendEmailInput) {
  if (env.GMAIL_ENABLED) return sendViaGmail(input);
  if (env.RESEND_API_KEY) return sendViaResend(input);
  if (env.IS_DEV) return { delivered: false };
  throw new Error('Email delivery is not configured. Set GMAIL_USER + GMAIL_APP_PASSWORD or RESEND_API_KEY.');
}
