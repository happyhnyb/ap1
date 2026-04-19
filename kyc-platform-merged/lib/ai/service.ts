import { postsAdapter } from '@/lib/adapters';
import type {
  AIArticleSummaryResponse,
  AICitation,
  AICopilotResponse,
  AIForecastExplanationResponse,
  AIPersonalizationResponse,
  AIPersona,
} from './types';
import {
  articleSummarySchema,
  copilotResponseSchema,
  forecastExplanationSchema,
  personalizationSchema,
} from './schemas';
import { buildCopilotPrompt, buildForecastExplanationPrompt, buildPersonalizationPrompt, buildSummaryPrompt, systemPrompt } from './prompts';
import { createStructuredResponse, isOpenAIConfigured } from './openai';
import { semanticSearch } from './retrieval';
import { getAITools } from './tools';
import { forecastingEngine } from '@/lib/forecasting/engine';

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
  if (!isOpenAIConfigured()) {
    return fallbackCopilot(query, persona, retrieval.results);
  }

  try {
    const response = await createStructuredResponse<{
      answer: string;
      bullets: string[];
      followUps: string[];
      guardrails: string[];
      confidence: 'high' | 'medium' | 'low' | 'insufficient';
      citations: AICitation[];
    }>({
      model: process.env.OPENAI_MODEL_COPILOT ?? 'gpt-5-mini',
      schema: copilotResponseSchema,
      cacheKey: `copilot:${persona}:${query}`,
      maxOutputTokens: 600,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            buildCopilotPrompt(query, persona),
            `Citations:\n${JSON.stringify(retrieval.results.slice(0, 4).map((c) => ({ id: c.id, title: c.title, excerpt: c.excerpt?.slice(0, 200), score: c.score })))}`,
          ].join('\n\n'),
        },
      ],
      tools: options.enableTools ? getAITools() : [],
    });

    const citations = response.citations.length ? response.citations : retrieval.results;
    return {
      mode: 'copilot',
      query,
      persona,
      answer: response.answer,
      bullets: response.bullets,
      followUps: response.followUps,
      guardrails: response.guardrails,
      confidence: response.confidence,
      citations,
      sources: citations,
      snippets: citations.map((citation) => citation.snippet),
    };
  } catch (error) {
    console.error('[runCopilot] falling back to retrieval-only response', error);
    return fallbackCopilot(query, persona, retrieval.results);
  }
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

  if (!isOpenAIConfigured()) {
    return {
      mode: 'forecast_explanation',
      commodity: input.commodity,
      answer: `Forecast explanation is available from trusted forecast data, but the OpenAI layer is not configured. Use the driver signals and cited internal sources below.`,
      drivers: drivers.top_features?.map((item) => item.feature_name || 'Driver') ?? [],
      risks: drivers.anomaly_flags?.map((item) => item.description || 'Risk') ?? [],
      watchouts: [`Model used: ${forecast.model_used}`],
      citations,
    };
  }

  // Slim payload — only the numbers the model needs, no pretty-printing
  const slimForecast = {
    commodity: forecast.commodity, market: forecast.market, state: forecast.state,
    latest_price: forecast.latest_price, direction: forecast.direction,
    trend_pct: Number(forecast.trend_pct?.toFixed(1)),
    horizon_days: input.horizon ?? 7, model: forecast.model_used,
    smape: forecast.meta.backtest.smape,
    forecast_end: forecast.forecast.at(-1),
  };
  const slimDrivers = drivers.top_features.slice(0, 4).map((f) => ({
    name: f.feature_name, dir: f.direction, imp: Number(f.importance?.toFixed(2)),
  }));
  const slimCitations = citations.slice(0, 3).map((c) => ({ title: c.title, excerpt: c.excerpt?.slice(0, 150) }));

  try {
    const response = await createStructuredResponse<{
      answer: string;
      drivers: string[];
      risks: string[];
      watchouts: string[];
      citations: AICitation[];
    }>({
      model: process.env.OPENAI_MODEL_COPILOT ?? 'gpt-5-mini',
      schema: forecastExplanationSchema,
      cacheKey: `forecast-explain:${JSON.stringify(input)}`,
      maxOutputTokens: 450,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            buildForecastExplanationPrompt(input.question || `Explain the forecast for ${input.commodity}.`),
            `Forecast:${JSON.stringify(slimForecast)}`,
            `Drivers:${JSON.stringify(slimDrivers)}`,
            `Citations:${JSON.stringify(slimCitations)}`,
          ].join('\n'),
        },
      ],
    });

    return {
      mode: 'forecast_explanation',
      commodity: input.commodity,
      answer: response.answer,
      drivers: response.drivers,
      risks: response.risks,
      watchouts: response.watchouts,
      citations: response.citations.length ? response.citations : citations,
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

  if (!isOpenAIConfigured()) {
    return {
      mode: 'article_summary',
      persona,
      title: post.title,
      summary: post.excerpt,
      bullets: post.body.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 4),
      citations,
    };
  }

  try {
    const response = await createStructuredResponse<{
      summary: string;
      bullets: string[];
      citations: AICitation[];
    }>({
      model: process.env.OPENAI_MODEL_SUMMARY ?? 'gpt-5-nano',
      schema: articleSummarySchema,
      cacheKey: `article-summary:${persona}:${slug}`,
      maxOutputTokens: 350,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            buildSummaryPrompt(post.title, persona),
            `Excerpt:${post.excerpt?.slice(0, 400)}`,
            `Body:${post.body.slice(0, 1400)}`,
          ].join('\n'),
        },
      ],
    });

    return {
      mode: 'article_summary',
      persona,
      title: post.title,
      summary: response.summary,
      bullets: response.bullets,
      citations: response.citations.length ? response.citations : citations,
    };
  } catch (error) {
    console.error('[summarizeArticle] falling back to article excerpt', error);
    return {
      mode: 'article_summary',
      persona,
      title: post.title,
      summary: post.excerpt,
      bullets: post.body.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 4),
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

  if (!isOpenAIConfigured()) {
    return {
      mode: 'personalization',
      persona: input.persona,
      summary: 'Personalization is using retrieved internal records, but the OpenAI layer is not configured.',
      recommendedQueries: retrieval.results.slice(0, 4).map((citation) => citation.title),
      recommendedSources: retrieval.results,
    };
  }

  try {
    const response = await createStructuredResponse<{
      summary: string;
      recommendedQueries: string[];
      recommendedSources: AICitation[];
    }>({
      model: process.env.OPENAI_MODEL_PERSONALIZATION ?? 'gpt-5-nano',
      schema: personalizationSchema,
      cacheKey: `personalization:${input.persona}:${query}`,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            buildPersonalizationPrompt(input.persona, input.interests),
            `Retrieved sources:\n${JSON.stringify(retrieval.results, null, 2)}`,
          ].join('\n\n'),
        },
      ],
    });

    return {
      mode: 'personalization',
      persona: input.persona,
      summary: response.summary,
      recommendedQueries: response.recommendedQueries,
      recommendedSources: response.recommendedSources.length ? response.recommendedSources : retrieval.results,
    };
  } catch (error) {
    console.error('[personalizeFeed] falling back to retrieval-only recommendations', error);
    return {
      mode: 'personalization',
      persona: input.persona,
      summary: 'Recommended using grounded KYC records because the AI personalization layer could not complete cleanly.',
      recommendedQueries: retrieval.results.slice(0, 4).map((citation) => citation.title),
      recommendedSources: retrieval.results,
    };
  }
}
