import { NextRequest, NextResponse } from 'next/server';
import { contactsAdapter } from '@/lib/adapters/contacts';
import { getServerSession } from '@/lib/auth/jwt';
import { isEditor } from '@/lib/auth/entitlement';
import { parseBody, ContactSchema } from '@/lib/validation';
import { checkRateLimit, getClientId, LIMITS } from '@/lib/ratelimit';

export async function GET() {
  const session = await getServerSession();
  if (!isEditor(session)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const contacts = await contactsAdapter.list();
  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ ok: true, ref: entry.ref }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/contact]', err);
    return NextResponse.json({ error: 'Failed to submit. Please try again.' }, { status: 500 });
  }
}
