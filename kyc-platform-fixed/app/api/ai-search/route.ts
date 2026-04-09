import { NextRequest, NextResponse } from 'next/server';
import { aiSearch } from '@/lib/search/ai';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessAISearch } from '@/lib/auth/entitlement';
import { UsageLogModel } from '@/lib/db/models/UsageLog';
import { isMongoConfigured, connectDB } from '@/lib/db/connect';

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!canAccessAISearch(session)) {
    return NextResponse.json(
      { error: 'AI search is available for KYC Pro subscribers only.' },
      { status: 403 }
    );
  }

  const query = req.nextUrl.searchParams.get('q') || '';
  if (!query.trim()) {
    return NextResponse.json({ error: 'Query is required.' }, { status: 400 });
  }

  try {
    const result = await aiSearch(query);

    // Log usage asynchronously (best-effort)
    if (isMongoConfigured()) {
      connectDB().then(() => {
        UsageLogModel.create({
          user_id:          session!._id,
          feature:          'ai_search',
          query,
          params:           {},
          response_summary: result.answer.slice(0, 200),
        }).catch(() => {});
      }).catch(() => {});
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('[GET /api/ai-search]', err);
    return NextResponse.json({ error: 'AI search failed.' }, { status: 500 });
  }
}
