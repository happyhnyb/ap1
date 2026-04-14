import { forecastingEngine } from '@/lib/forecasting/engine';
import { getHistoricalRecords, getRecords, filterRecords, buildSummary } from '@/lib/mandi/engine';
import { semanticSearch } from './retrieval';
import type { AIToolDefinition } from './openai';

function stringArg(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberArg(value: unknown, fallback: number, min = 1, max = 14) {
  const parsed = typeof value === 'number' ? value : parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function getAITools(): AIToolDefinition[] {
  return [
    {
      name: 'search_articles',
      description: 'Semantic search across articles, explainers, FAQs, policy notes, and methodology docs.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['query'],
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
          commodity: { type: 'string' },
        },
      },
      handler: async (args) => semanticSearch(stringArg(args.query), {
        limit: numberArg(args.limit, 6, 1, 12),
        commodity: stringArg(args.commodity) || undefined,
      }),
    },
    {
      name: 'get_forecast',
      description: 'Get trusted numeric forecast output from the KYC forecasting engine.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['commodity'],
        properties: {
          commodity: { type: 'string' },
          state: { type: 'string' },
          market: { type: 'string' },
          district: { type: 'string' },
          horizon: { type: 'number' },
        },
      },
      handler: async (args) => forecastingEngine.forecast({
        commodity: stringArg(args.commodity),
        state: stringArg(args.state) || undefined,
        market: stringArg(args.market) || undefined,
        district: stringArg(args.district) || undefined,
        horizon: numberArg(args.horizon, 7, 1, 14),
      }),
    },
    {
      name: 'compare_mandis',
      description: 'Compare two mandi filters or surface stronger nearby mandi conditions for a commodity.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['commodity'],
        properties: {
          commodity: { type: 'string' },
          state: { type: 'string' },
          market_a: { type: 'string' },
          market_b: { type: 'string' },
          district_a: { type: 'string' },
          district_b: { type: 'string' },
        },
      },
      handler: async (args) => {
        const commodity = stringArg(args.commodity);
        const state = stringArg(args.state) || undefined;
        const { records, fetchedAt } = await getHistoricalRecords({ commodity, state: state || '', district: '', market: '', variety: '', grade: '' }, 14);

        const summaryFor = (market?: string, district?: string) => {
          const filtered = filterRecords(records, {
            commodity,
            state: state || '',
            district: district || '',
            market: market || '',
            variety: '',
            grade: '',
          });
          return buildSummary(filtered, fetchedAt);
        };

        return {
          commodity,
          state: state || null,
          market_a: summaryFor(stringArg(args.market_a), stringArg(args.district_a)),
          market_b: summaryFor(stringArg(args.market_b), stringArg(args.district_b)),
        };
      },
    },
    {
      name: 'get_driver_signals',
      description: 'Get trusted driver signals behind the selected forecast.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['commodity'],
        properties: {
          commodity: { type: 'string' },
          state: { type: 'string' },
          market: { type: 'string' },
          district: { type: 'string' },
          horizon: { type: 'number' },
        },
      },
      handler: async (args) => forecastingEngine.drivers({
        commodity: stringArg(args.commodity),
        state: stringArg(args.state) || undefined,
        market: stringArg(args.market) || undefined,
        district: stringArg(args.district) || undefined,
        horizon: numberArg(args.horizon, 7, 1, 14),
      }),
    },
    {
      name: 'get_commodity_snapshot',
      description: 'Get latest mandi snapshot stats for a commodity and optional geography filter.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['commodity'],
        properties: {
          commodity: { type: 'string' },
          state: { type: 'string' },
          market: { type: 'string' },
          district: { type: 'string' },
        },
      },
      handler: async (args) => {
        const { records, fetchedAt } = await getRecords();
        const filtered = filterRecords(records, {
          commodity: stringArg(args.commodity),
          state: stringArg(args.state),
          market: stringArg(args.market),
          district: stringArg(args.district),
          variety: '',
          grade: '',
        });
        return buildSummary(filtered, fetchedAt);
      },
    },
    {
      name: 'get_policy_events',
      description: 'Retrieve internal policy or event notes relevant to a commodity or query.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string' },
          commodity: { type: 'string' },
          limit: { type: 'number' },
        },
      },
      handler: async (args) => semanticSearch(stringArg(args.query) || stringArg(args.commodity), {
        limit: numberArg(args.limit, 5, 1, 10),
        commodity: stringArg(args.commodity) || undefined,
        kinds: ['policy_note', 'article'],
      }),
    },
  ];
}

export async function invokeAITool(name: string, args: Record<string, unknown>) {
  const tool = getAITools().find((item) => item.name === name);
  if (!tool) {
    throw new Error(`Unknown AI tool: ${name}`);
  }
  return tool.handler(args);
}

