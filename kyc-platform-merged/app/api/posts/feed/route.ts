/**
 * GET /api/posts/feed?page=1&limit=12&type=ARTICLE
 * Paginated feed for infinite scroll. Public — no auth required.
 */
import { NextRequest, NextResponse } from 'next/server';
import { postsAdapter } from '@/lib/adapters';
import { getPagedPostsSnapshot } from '@/lib/fallback/posts-snapshot';

const PAGE_SIZE = 12;

function isNetlifyRuntime() {
  const runtimeEnv = globalThis.process?.env ?? {};
  return Boolean(runtimeEnv.NETLIFY || runtimeEnv.DEPLOY_ID || runtimeEnv.SITE_ID || runtimeEnv.URL?.includes('netlify.app'));
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page  = Math.max(1, parseInt(searchParams.get('page')  || '1'));
  const limit = Math.min(24, Math.max(1, parseInt(searchParams.get('limit') || String(PAGE_SIZE))));
  const type  = searchParams.get('type') ?? undefined;

  // Validate type param
  const validTypes = new Set(['ARTICLE', 'STORY', 'SHORT']);
  const safeType = type && validTypes.has(type.toUpperCase()) ? type.toUpperCase() : undefined;

  try {
    if (isNetlifyRuntime()) {
      const { posts, total } = getPagedPostsSnapshot(page, limit, safeType);
      const hasMore = page * limit < total;
      return NextResponse.json({ posts, total, page, hasMore });
    }

    const { posts, total } = await postsAdapter.listPublishedPaged(page, limit, safeType);
    const hasMore = page * limit < total;
    return NextResponse.json({ posts, total, page, hasMore });
  } catch {
    return NextResponse.json({ error: 'Failed to load feed.' }, { status: 500 });
  }
}
