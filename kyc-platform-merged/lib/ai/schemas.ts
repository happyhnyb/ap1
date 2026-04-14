import type { AIPersona } from './types';

type JsonSchema = Record<string, unknown>;

function citationSchema(): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'title', 'kind', 'slug', 'href', 'excerpt', 'snippet', 'score'],
    properties: {
      id: { type: 'string' },
      title: { type: 'string' },
      kind: { type: 'string' },
      slug: { type: ['string', 'null'] },
      href: { type: ['string', 'null'] },
      excerpt: { type: 'string' },
      snippet: { type: 'string' },
      score: { type: 'number' },
    },
  };
}

export const personaEnum: AIPersona[] = ['farmer', 'trader', 'procurement', 'general'];

export const copilotResponseSchema = {
  name: 'kyc_copilot_response',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['answer', 'bullets', 'followUps', 'guardrails', 'confidence', 'citations'],
    properties: {
      answer: { type: 'string' },
      bullets: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      followUps: { type: 'array', items: { type: 'string' }, maxItems: 4 },
      guardrails: { type: 'array', items: { type: 'string' }, maxItems: 4 },
      confidence: { type: 'string', enum: ['high', 'medium', 'low', 'insufficient'] },
      citations: { type: 'array', items: citationSchema(), maxItems: 8 },
    },
  },
} as const;

export const forecastExplanationSchema = {
  name: 'kyc_forecast_explanation',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['answer', 'drivers', 'risks', 'watchouts', 'citations'],
    properties: {
      answer: { type: 'string' },
      drivers: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      risks: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      watchouts: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      citations: { type: 'array', items: citationSchema(), maxItems: 8 },
    },
  },
} as const;

export const articleSummarySchema = {
  name: 'kyc_article_summary',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'bullets', 'citations'],
    properties: {
      summary: { type: 'string' },
      bullets: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      citations: { type: 'array', items: citationSchema(), minItems: 1, maxItems: 4 },
    },
  },
} as const;

export const personalizationSchema = {
  name: 'kyc_personalization',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'recommendedQueries', 'recommendedSources'],
    properties: {
      summary: { type: 'string' },
      recommendedQueries: { type: 'array', items: { type: 'string' }, maxItems: 6 },
      recommendedSources: { type: 'array', items: citationSchema(), maxItems: 6 },
    },
  },
} as const;

export const moderationDecisionSchema = {
  name: 'kyc_moderation_decision',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['allowed', 'reason'],
    properties: {
      allowed: { type: 'boolean' },
      reason: { type: 'string' },
    },
  },
} as const;

export const eventExtractionSchema = {
  name: 'kyc_event_extraction',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['events'],
    properties: {
      events: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'event_type', 'commodity', 'geography', 'impact_direction', 'impact_horizon', 'evidence'],
          properties: {
            title: { type: 'string' },
            event_type: { type: 'string', enum: ['policy', 'trade', 'weather', 'supply', 'demand', 'logistics', 'market_signal'] },
            commodity: { type: ['string', 'null'] },
            geography: { type: ['string', 'null'] },
            impact_direction: { type: 'string', enum: ['bullish', 'bearish', 'mixed', 'neutral'] },
            impact_horizon: { type: 'string', enum: ['immediate', 'short_term', 'medium_term', 'long_term'] },
            evidence: { type: 'string' },
          },
        },
      },
    },
  },
} as const;

export const taggingSchema = {
  name: 'kyc_article_tagging',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['tags'],
    properties: {
      tags: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 12,
      },
    },
  },
} as const;
