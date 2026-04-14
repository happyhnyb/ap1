import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { isPremiumUser } from '@/lib/auth/entitlement';
import { UsageLogModel } from '@/lib/db/models/UsageLog';
import { isMongoConfigured, connectDB } from '@/lib/db/connect';
import { checkRateLimit, getClientId, LIMITS } from '@/lib/ratelimit';
import { usersAdapter } from '@/lib/adapters';
import { assertSafeUserText } from '@/lib/ai/moderation';
import { runCopilot } from '@/lib/ai/service';

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: 'AI search is available for KYC Pro subscribers only.' },
      { status: 403 }
    );
  }

  const hasSessionPremiumAccess = session.role === 'admin'
    || session.role === 'editor'
    || (session.role === 'premium' && session.sub_status === 'active');
  let hasPremiumAccess = hasSessionPremiumAccess;

  if (!hasSessionPremiumAccess) {
    try {
      const user = await usersAdapter.getByEmail(session.email);
      hasPremiumAccess = isPremiumUser(user);
    } catch (error) {
      console.error('[GET /api/ai-search] premium DB check failed, falling back to session entitlement', error);
    }
  }

  if (!hasPremiumAccess) {
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
  const persona = (req.nextUrl.searchParams.get('persona')?.trim() ?? 'general') as 'farmer' | 'trader' | 'procurement' | 'general';
  if (!query || query.length > 200) {
    return NextResponse.json({ error: 'Query must be between 1 and 200 characters.' }, { status: 400 });
  }

  try {
    await assertSafeUserText(query, 'AI search query');
    const result = await runCopilot(query, persona, { enableTools: false, fastMode: true });

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
