import { env } from '@/lib/env';
import { getContactNotificationRecipients, sendResendEmail } from '@/lib/email/resend';

type ContactNotificationInput = {
  ref: string;
  name: string;
  email: string;
  subject: string;
  message: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendContactSubmissionNotifications(input: ContactNotificationInput) {
  const recipients = getContactNotificationRecipients();
  if (!recipients.length) {
    if (env.IS_DEV) return { delivered: false };
    throw new Error('Contact notification recipients are not configured. Set CONTACT_EMAIL.');
  }

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
      <h2 style="margin:0 0 12px">New KYC contact submission</h2>
      <p style="margin:0 0 12px"><strong>Reference:</strong> ${escapeHtml(input.ref)}</p>
      <p style="margin:0 0 12px"><strong>Name:</strong> ${escapeHtml(input.name)}</p>
      <p style="margin:0 0 12px"><strong>Email:</strong> ${escapeHtml(input.email)}</p>
      <p style="margin:0 0 12px"><strong>Subject:</strong> ${escapeHtml(input.subject)}</p>
      <div style="margin:0;padding:14px;border-radius:10px;background:#f4f4f0;border:1px solid #e5e7eb;white-space:pre-wrap">${escapeHtml(input.message)}</div>
    </div>
  `.trim();

  return sendResendEmail({
    to: recipients,
    subject: `New contact submission: ${input.subject}`,
    html,
    replyTo: input.email,
  });
}
