import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { isEditor } from '@/lib/auth/entitlement';
import { postsAdapter } from '@/lib/adapters';
import { proxyRouteToMacMini } from '@/lib/server/mac-mini-proxy';
import { isInternalApiRequestAuthorized, getInternalApiAuthError } from '@/lib/server/internal-auth';
import { env } from '@/lib/env';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!env.DATABASE_URL && env.MAC_MINI_API_BASE_URL) {
    return proxyRouteToMacMini(req);
  }

  const session = await getServerSession();
  if (!isEditor(session) && !isInternalApiRequestAuthorized(req)) {
    return NextResponse.json(getInternalApiAuthError(), { status: 401 });
  }

  const { id } = await params;
  const post = await postsAdapter.publishById(id);
  if (!post) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, post });
}
