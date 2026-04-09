import { NextRequest, NextResponse } from 'next/server';
import { contactsAdapter } from '@/lib/adapters/contacts';
import { getServerSession } from '@/lib/auth/jwt';
import { isEditor } from '@/lib/auth/entitlement';

export async function GET() {
  const session = await getServerSession();
  if (!isEditor(session)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const contacts = await contactsAdapter.list();
  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  try {
    const { name, email, subject, message } = await req.json() as {
      name: string; email: string; subject: string; message: string;
    };

    if (!name?.trim() || !email?.trim() || !subject?.trim() || !message?.trim()) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
    }

    if (message.length > 2000) {
      return NextResponse.json({ error: 'Message cannot exceed 2000 characters.' }, { status: 400 });
    }

    const entry = await contactsAdapter.create({ name, email, subject, message });
    return NextResponse.json({ ok: true, ref: entry.ref }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/contact]', err);
    return NextResponse.json({ error: 'Failed to submit.' }, { status: 500 });
  }
}
