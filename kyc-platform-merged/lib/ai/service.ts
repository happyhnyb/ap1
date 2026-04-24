import { postsAdapter } from '@/lib/adapters';
import type {
  AIArticleSummaryResponse,
  AICitation,
  AICopilotResponse,
  AIForecastExplanationResponse,
  AIPersonalizationResponse,
  AIPersona,
} from './types';
import { semanticSearch } from './retrieval';
import { forecastingEngine } from '@/lib/forecasting/engine';
import { explainForecastWithOllama, summarizeTextWithOllama } from '@/lib/local-ai/ollama';

function fallbackCopilot(query: string, persona: AIPersona, citations: AICitation[]): AICopilotResponse {
  const best = citations[0];
  return {
    mode: 'copilot',
    query,
    persona,
    answer: best
      ? `I found relevant internal material, but the AI layer is not configured. Start with "${best.title}" and the cited sources below.`
      : 'AI copilot is not configured, and I do not have enough internal evidence to answer confidently.',
    bullets: citations.slice(0, 3).map((citation) => citation.title),
    followUps: [
      'Ask for a commodity-specific summary',
      'Ask for a mandi comparison',
      'Ask what changed after a policy update',
    ],
    guardrails: ['Uses internal KYC records only', 'Does not invent forecast numbers'],
    confidence: citations.length ? 'low' : 'insufficient',
    citations,
    sources: citations,
    snippets: citations.map((citation) => citation.snippet),
  };
}

export async function runCopilot(
  query: string,
  persona: AIPersona,
  options: { enableTools?: boolean; fastMode?: boolean } = {},
): Promise<AICopilotResponse> {
  const retrieval = await semanticSearch(query, {
    limit: 6,
    disableEmbeddings: options.fastMode,
  });
  return fallbackCopilot(query, persona, retrieval.results);
}

export async function explainForecast(input: {
  commodity: string;
  state?: string;
  market?: string;
  district?: string;
  horizon?: number;
  question?: string;
}): Promise<AIForecastExplanationResponse> {
  const forecast = await forecastingEngine.forecast({
    commodity: input.commodity,
    state: input.state,
    market: input.market,
    district: input.district,
    horizon: input.horizon ?? 7,
  });
  const drivers = await forecastingEngine.drivers({
    commodity: input.commodity,
    state: input.state,
    market: input.market,
    district: input.district,
    horizon: input.horizon ?? 7,
  });
  const citations = (await semanticSearch(`${input.commodity} ${input.question || 'forecast drivers'}`, { limit: 4 })).results;

  try {
    const response = await explainForecastWithOllama({
      commodity: input.commodity,
      state: input.state,
      district: input.district,
      market: input.market,
      horizon: input.horizon ?? 7,
      latestPrice: forecast.latest_price,
      direction: forecast.direction,
      trendPct: forecast.trend_pct,
      modelUsed: forecast.model_used,
      smape: forecast.meta.backtest.smape,
      drivers: drivers.top_features?.map((item) => item.feature_name || 'Driver') ?? [],
      risks: drivers.anomaly_flags?.map((item) => item.description || 'Risk') ?? [],
      citations: citations.map((citation) => ({
        title: citation.title,
        excerpt: citation.excerpt || citation.snippet,
      })),
    });

    return {
      mode: 'forecast_explanation',
      commodity: input.commodity,
      answer: response.answer,
      drivers: response.drivers,
      risks: response.risks,
      watchouts: response.watchouts,
      citations,
    };
  } catch (error) {
    console.error('[explainForecast] falling back to trusted model metadata', error);
    return {
      mode: 'forecast_explanation',
      commodity: input.commodity,
      answer: `The current forecast uses ${forecast.model_used} with recent error band ${forecast.explanation.recent_error_band != null ? `around ${forecast.explanation.recent_error_band.toFixed(1)}%` : 'not yet available'}. Use the driver and risk bullets below as the trusted explanation layer.`,
      drivers: drivers.top_features?.map((item) => item.feature_name || 'Driver') ?? [],
      risks: drivers.anomaly_flags?.map((item) => item.description || 'Risk') ?? [],
      watchouts: [`Model used: ${forecast.model_used}`],
      citations,
    };
  }
}

export async function summarizeArticle(slug: string, persona: AIPersona): Promise<AIArticleSummaryResponse> {
  const post = await postsAdapter.getBySlug(slug);
  if (!post) {
    throw new Error('Article not found.');
  }

  const citations: AICitation[] = [{
    id: `post:${post.slug}`,
    title: post.title,
    kind: post.category === 'Policy' ? 'policy_note' : 'article',
    slug: post.slug,
    href: `/post/${post.slug}`,
    excerpt: post.excerpt,
    snippet: post.body.slice(0, 260),
    score: 1,
  }];

  try {
    const response = await summarizeTextWithOllama([
      `Persona: ${persona}`,
      `Title: ${post.title}`,
      `Excerpt: ${post.excerpt ?? ''}`,
      `Body: ${post.body}`,
    ].join('\n\n'), post.title);

    return {
      mode: 'article_summary',
      persona,
      title: response.data.title || post.title,
      summary: response.data.summary,
      bullets: response.data.bullets,
      citations,
    };
  } catch (error) {
    console.error('[summarizeArticle] falling back to article excerpt', error);
    return {
      mode: 'article_summary',
      persona,
      title: post.title,
      summary: post.excerpt,
      bullets: post.body.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 3),
      citations,
    };
  }
}

export async function personalizeFeed(input: {
  persona: AIPersona;
  interests: string[];
}): Promise<AIPersonalizationResponse> {
  const query = input.interests.join(' ') || 'agriculture commodity intelligence';
  const retrieval = await semanticSearch(query, { limit: 6 });
  return {
    mode: 'personalization',
    persona: input.persona,
    summary: 'Recommended using grounded KYC records ranked against the current interests you entered.',
    recommendedQueries: retrieval.results.slice(0, 4).map((citation) => citation.title),
    recommendedSources: retrieval.results,
  };
}
