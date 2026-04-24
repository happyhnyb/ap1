import { NextRequest, NextResponse } from 'next/server';
import { semanticSearch } from '@/lib/ai/retrieval';
import type { AICitation } from '@/lib/ai/types';
import { assertSafeUserText } from '@/lib/ai/moderation';
import { getInternalApiAuthError, isInternalApiRequestAuthorized } from '@/lib/server/internal-auth';

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
  if (!isInternalApiRequestAuthorized(req)) {
    return NextResponse.json(getInternalApiAuthError(), { status: 401 });
  }

  const query = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const persona = (req.nextUrl.searchParams.get('persona')?.trim() ?? 'general') as 'farmer' | 'trader' | 'procurement' | 'general';
  if (!query || query.length > 200) {
    return NextResponse.json({ error: 'Query must be between 1 and 200 characters.' }, { status: 400 });
  }

  try {
    await assertSafeUserText(query, 'AI search query');
    const retrieval = await semanticSearch(query, { limit: 6, disableEmbeddings: true });
    const grounded = groundedAnswer(query, retrieval.results);
    return NextResponse.json({
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
    });
  } catch (error) {
    console.error('[GET /api/internal/ai-search]', error);
    return NextResponse.json({ error: 'AI search failed. Please try again.' }, { status: 500 });
  }
}
