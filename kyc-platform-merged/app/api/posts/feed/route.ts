/**
 * GET /api/posts/feed?page=1&limit=12&type=ARTICLE
 * Paginated feed for infinite scroll. Public — no auth required.
 */
import { NextRequest, NextResponse } from 'next/server';
import { postsAdapter } from '@/lib/adapters';

const PAGE_SIZE = 12;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page  = Math.max(1, parseInt(searchParams.get('page')  || '1'));
  const limit = Math.min(24, Math.max(1, parseInt(searchParams.get('limit') || String(PAGE_SIZE))));
  const type  = searchParams.get('type') ?? undefined;

  // Validate type param
  const validTypes = new Set(['ARTICLE', 'STORY', 'SHORT']);
  const safeType = type && validTypes.has(type.toUpperCase()) ? type.toUpperCase() : undefined;

  try {
    const { posts, total } = await postsAdapter.listPublishedPaged(page, limit, safeType);
    const hasMore = page * limit < total;
    return NextResponse.json({ posts, total, page, hasMore });
  } catch {
    return NextResponse.json({ error: 'Failed to load feed.' }, { status: 500 });
  }
}
