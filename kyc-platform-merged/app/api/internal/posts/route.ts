import { NextRequest, NextResponse } from 'next/server';
import { postsAdapter } from '@/lib/adapters';
import { getInternalApiAuthError, isInternalApiRequestAuthorized } from '@/lib/server/internal-auth';
import { parseBody, CreatePostSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q');
  const page = Number(req.nextUrl.searchParams.get('page') ?? '0');
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? '0');
  const type = req.nextUrl.searchParams.get('type') ?? undefined;
  const all = req.nextUrl.searchParams.get('all') === 'true';

  try {
    if (q) {
      const posts = await postsAdapter.search(q);
      return NextResponse.json(posts);
    }

    if (all) {
      if (!isInternalApiRequestAuthorized(req)) {
        return NextResponse.json(getInternalApiAuthError(), { status: 401 });
      }
      const posts = await postsAdapter.listAll();
      return NextResponse.json(posts);
    }

    if (page > 0 && limit > 0) {
      const result = await postsAdapter.listPublishedPaged(page, limit, type);
      return NextResponse.json(result);
    }

    const posts = await postsAdapter.listPublished();
    return NextResponse.json(posts);
  } catch (err) {
    console.error('[GET /api/internal/posts]', err);
    return NextResponse.json({ error: 'Failed to fetch posts.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isInternalApiRequestAuthorized(req)) {
    return NextResponse.json(getInternalApiAuthError(), { status: 401 });
  }

  const parsed = await parseBody(CreatePostSchema, req);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const author = req.headers.get('x-internal-author-name')?.trim() || 'System';
  const authorId = req.headers.get('x-internal-author-id')?.trim() || 'system';
  const post = await postsAdapter.create({
    ...parsed.data,
    author,
    author_id: authorId,
  });
  return NextResponse.json({ post }, { status: 201 });
}
