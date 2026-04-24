import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { isPremiumUser } from '@/lib/auth/entitlement';
import { UsageLogModel } from '@/lib/db/models/UsageLog';
import { isMongoConfigured, connectDB } from '@/lib/db/connect';
import { checkRateLimit, getClientId, LIMITS } from '@/lib/ratelimit';
import { usersAdapter } from '@/lib/adapters';
import { semanticSearch } from '@/lib/ai/retrieval';
import type { AICitation } from '@/lib/ai/types';
import { getFromMacMini, shouldProxyToMacMini } from '@/lib/server/mac-mini';

function groundedAnswer(query: string, citations: AICitation[]) {
  if (!citations.length) {
    return {
      answer: `I could not find enough internal KYC records to answer "${query}" safely. Try a commodity, market, policy, or article title.`,
      bullets: [
        'No internal source was strong enough to cite.',
        'I will not invent mandi prices, policy changes, or forecast numbers.',
      ],
      confidence: 'insufficient' as const,
    };
  }

  const top = citations[0];
  const bullets = citations.slice(0, 4).map((citation) => citation.excerpt || citation.title);
  return {
    answer: `Here is the grounded KYC view for "${query}". The most relevant internal source is "${top.title}". Use the cited records below for the underlying evidence; I am not inventing any price move or forecast number beyond those sources.`,
    bullets,
    confidence: citations[0].score >= 0.75 ? 'medium' as const : 'low' as const,
  };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json(
      { error: 'Sign in with an eligible research-access account to use AI search.' },
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
      { error: 'AI search is currently limited to eligible research-access accounts.' },
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
    const result = shouldProxyToMacMini()
      ? await getFromMacMini<{
          mode: 'copilot';
          query: string;
          persona: 'farmer' | 'trader' | 'procurement' | 'general';
          answer: string;
          bullets: string[];
          followUps: string[];
          guardrails: string[];
          confidence: 'high' | 'medium' | 'low' | 'insufficient';
          citations: AICitation[];
          sources: AICitation[];
          snippets: string[];
        }>(`/api/internal/ai-search?q=${encodeURIComponent(query)}&persona=${encodeURIComponent(persona)}`)
      : await (async () => {
          const retrieval = await semanticSearch(query, { limit: 6, disableEmbeddings: true });
          const grounded = groundedAnswer(query, retrieval.results);
          return {
            mode: 'copilot' as const,
            query,
            persona,
            answer: grounded.answer,
            bullets: grounded.bullets,
            followUps: [
              'Ask for a commodity-specific summary',
              'Ask for a mandi comparison in Predictor',
              'Search the cited article for policy details',
            ],
            guardrails: [
              'Uses internal KYC records only',
              'Does not invent forecast numbers',
              `Retrieval mode: ${retrieval.retrievalMode}`,
            ],
            confidence: grounded.confidence,
            citations: retrieval.results,
            sources: retrieval.results,
            snippets: retrieval.results.map((citation) => citation.snippet),
          };
        })();

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
