import { NextRequest, NextResponse } from 'next/server';
import { postsAdapter } from '@/lib/adapters';
import { getServerSession } from '@/lib/auth/jwt';
import { isEditor } from '@/lib/auth/entitlement';
import { parseBody, CreatePostSchema } from '@/lib/validation';
import { proxyRouteToMacMini } from '@/lib/server/mac-mini-proxy';
import { env } from '@/lib/env';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const all = searchParams.get('all') === 'true';
  const page = Number(searchParams.get('page') ?? '0');
  const limit = Number(searchParams.get('limit') ?? '0');
  const type = searchParams.get('type') ?? undefined;

  if (all) {
    const session = await getServerSession();
    if (!isEditor(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(await postsAdapter.listAll());
  }

  if (page > 0 && limit > 0) {
    return NextResponse.json(await postsAdapter.listPublishedPaged(page, limit, type));
  }

  return NextResponse.json(await postsAdapter.listPublished());
}

export async function POST(req: NextRequest) {
  if (!env.DATABASE_URL && env.MAC_MINI_API_BASE_URL) {
    return proxyRouteToMacMini(req);
  }

  const session = await getServerSession();
  if (!isEditor(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await parseBody(CreatePostSchema, req);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const post = await postsAdapter.create({
    ...parsed.data,
    author: session!.name,
    author_id: session!._id,
  });

  return NextResponse.json(post, { status: 201 });
}
