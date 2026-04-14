import { NextRequest, NextResponse } from 'next/server';
import { semanticSearch } from '@/lib/ai/retrieval';
import { assertSafeUserText } from '@/lib/ai/moderation';

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const commodity = req.nextUrl.searchParams.get('commodity')?.trim() ?? '';
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '6', 10);

  if (!query) {
    return NextResponse.json({ query: '', results: [], retrievalMode: 'lexical' });
  }

  try {
    await assertSafeUserText(query, 'search query');
    const result = await semanticSearch(query, { commodity: commodity || undefined, limit });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/ai/semantic-search]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Semantic search failed.' }, { status: 400 });
  }
}

