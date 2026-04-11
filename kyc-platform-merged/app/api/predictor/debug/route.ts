import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { isAdmin } from '@/lib/auth/entitlement';

export const maxDuration = 60;

/** Admin-only: shows raw API response to diagnose data issues. */
export async function GET() {
  const session = await getServerSession();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Admin only.' }, { status: 403 });
  }

  const apiKey = process.env.DATAGOV_API_KEY || '';
  if (!apiKey) {
    return NextResponse.json({ error: 'DATAGOV_API_KEY not set.' }, { status: 503 });
  }

  const RESOURCE_ID = '9ef84268-d588-465a-a308-a864a43d0070';
  const url = `https://api.data.gov.in/resource/${RESOURCE_ID}?api-key=${apiKey}&format=json&limit=10&offset=0`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }

    return NextResponse.json({
      httpStatus: res.status,
      apiKeyLength: apiKey.length,
      rawResponse: data,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
