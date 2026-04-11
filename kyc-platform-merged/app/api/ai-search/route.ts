import { NextRequest, NextResponse } from 'next/server';
import { aiSearch } from '@/lib/search/ai';
import { getServerSession } from '@/lib/auth/jwt';
import { isPremiumUser } from '@/lib/auth/entitlement';
import { UsageLogModel } from '@/lib/db/models/UsageLog';
import { isMongoConfigured, connectDB } from '@/lib/db/connect';
import { checkRateLimit, getClientId, LIMITS } from '@/lib/ratelimit';
import { usersAdapter } from '@/lib/adapters';

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: 'AI search is available for KYC Pro subscribers only.' },
      { status: 403 }
    );
  }
  // Fresh DB check
  const user = await usersAdapter.getByEmail(session.email);
  if (!isPremiumUser(user)) {
    return NextResponse.json(
      { error: 'AI search is available for KYC Pro subscribers only.' },
      { status: 403 }
    );
  }

  const rl = checkRateLimit(getClientId(req), 'ai-search', LIMITS.aiSearch);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many AI search requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const query = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (!query || query.length > 200) {
    return NextResponse.json({ error: 'Query must be between 1 and 200 characters.' }, { status: 400 });
  }

  try {
    const result = await aiSearch(query);

    // Log usage asynchronously — best-effort, never blocks the response
    if (isMongoConfigured()) {
      connectDB()
        .then(() => UsageLogModel.create({
          user_id:          session!._id,
          feature:          'ai_search',
          query,
          params:           {},
          response_summary: result.answer.slice(0, 200),
        }))
        .catch(() => { /* ignore logging errors */ });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('[GET /api/ai-search]', err);
    return NextResponse.json({ error: 'AI search failed. Please try again.' }, { status: 500 });
  }
}
