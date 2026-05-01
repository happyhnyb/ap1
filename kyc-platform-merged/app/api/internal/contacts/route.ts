import { NextRequest, NextResponse } from 'next/server';
import { contactsAdapter } from '@/lib/adapters';
import { getInternalApiAuthError, isInternalApiRequestAuthorized } from '@/lib/server/internal-auth';

export async function GET(req: NextRequest) {
  if (!isInternalApiRequestAuthorized(req)) {
    return NextResponse.json(getInternalApiAuthError(), { status: 401 });
  }

  const contacts = await contactsAdapter.list();
  return NextResponse.json(contacts);
}
