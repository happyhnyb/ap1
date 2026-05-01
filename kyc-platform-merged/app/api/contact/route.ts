import { NextRequest, NextResponse } from 'next/server';
import { contactsAdapter } from '@/lib/adapters/contacts';
import { getServerSession } from '@/lib/auth/jwt';
import { isEditor } from '@/lib/auth/entitlement';
import { parseBody, ContactSchema } from '@/lib/validation';
import { checkRateLimit, getClientId, LIMITS } from '@/lib/ratelimit';
import { proxyRouteToMacMini } from '@/lib/server/mac-mini-proxy';
import { env } from '@/lib/env';
import { sendContactSubmissionNotifications } from '@/lib/email/contact-notifications';

export async function GET(req: NextRequest) {
  if (!env.DATABASE_URL && env.MAC_MINI_API_BASE_URL) {
    return proxyRouteToMacMini(req);
  }

  const session = await getServerSession();
  if (!isEditor(session)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const contacts = await contactsAdapter.list();
  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  if (!env.DATABASE_URL && env.MAC_MINI_API_BASE_URL) {
    return proxyRouteToMacMini(req);
  }

  const rl = checkRateLimit(getClientId(req), 'contact', LIMITS.contact);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many submissions. Please wait a few minutes before trying again.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const parsed = await parseBody(ContactSchema, req);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const entry = await contactsAdapter.create(parsed.data);
    const emailResult = await sendContactSubmissionNotifications({
      ref: entry.ref,
      name: entry.name,
      email: entry.email,
      subject: entry.subject,
      message: entry.message,
    }).catch((error) => {
      console.error('[POST /api/contact] notification email failed', error);
      return { delivered: false };
    });

    return NextResponse.json({ ok: true, ref: entry.ref, email_delivered: emailResult.delivered }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/contact]', err);
    return NextResponse.json({ error: 'Failed to submit. Please try again.' }, { status: 500 });
  }
}
