import { NextRequest, NextResponse } from 'next/server';
import { standardSearch } from '@/lib/search/standard';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const query      = searchParams.get('q') || '';
  const type       = searchParams.get('type') || '';
  const is_premium = searchParams.get('premium') as 'true' | 'false' | '' || '';
  const from       = searchParams.get('from') || '';
  const to         = searchParams.get('to') || '';

  if (!query.trim()) {
    return NextResponse.json({ results: [], query: '', total: 0 });
  }

  try {
    const results = await standardSearch(query, { type, is_premium, from, to });
    return NextResponse.json({
      results: results.map((r) => ({
        slug:       r.post.slug,
        title:      r.post.title,
        type:       r.post.type,
        category:   r.post.category,
        excerpt:    r.post.excerpt,
        snippet:    r.snippet,
        is_premium: r.post.is_premium,
        published_at: r.post.published_at,
        author:     r.post.author,
        score:      r.score,
      })),
      query,
      total: results.length,
    });
  } catch (err) {
    console.error('[GET /api/search]', err);
    return NextResponse.json({ error: 'Search failed.' }, { status: 500 });
  }
}
