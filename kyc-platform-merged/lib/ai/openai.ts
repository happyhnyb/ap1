import { env } from '@/lib/env';
import { getCached, setCached } from './cache';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

type ResponseSchema = {
  name: string;
  schema: Record<string, unknown>;
};

async function fetchOpenAI(path: string, payload: Record<string, unknown>, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`https://api.openai.com/v1${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI ${path} failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<Record<string, unknown>>;
  } finally {
    clearTimeout(timeout);
  }
}

async function withRetries<T>(fn: () => Promise<T>, retries = env.OPENAI_MAX_RETRIES): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

function readOutputText(response: Record<string, unknown>): string {
  if (typeof response.output_text === 'string' && response.output_text) {
    return response.output_text;
  }

  const output = Array.isArray(response.output) ? response.output as Array<Record<string, unknown>> : [];
  const message = output.find((item) => item.type === 'message');
  const content = Array.isArray(message?.content) ? message?.content as Array<Record<string, unknown>> : [];
  const textItem = content.find((item) => item.type === 'output_text' || item.type === 'text');
  return typeof textItem?.text === 'string' ? textItem.text : '';
}

function readToolCalls(response: Record<string, unknown>) {
  const output = Array.isArray(response.output) ? response.output as Array<Record<string, unknown>> : [];
  return output
    .filter((item) => item.type === 'function_call')
    .map((item) => ({
      callId: String(item.call_id),
      name: String(item.name),
      argumentsJson: typeof item.arguments === 'string' ? item.arguments : '{}',
    }));
}

function schemaFormat(schema: ResponseSchema) {
  return {
    type: 'json_schema',
    name: schema.name,
    strict: true,
    schema: schema.schema,
  };
}

export function isOpenAIConfigured() {
  return !!env.OPENAI_API_KEY;
}

export async function moderateText(input: string) {
  if (!env.OPENAI_ENABLE_MODERATION || !env.OPENAI_API_KEY) {
    return { flagged: false, categories: {} };
  }

  const cacheKey = `moderation:${input}`;
  const cached = getCached<{ flagged: boolean; categories: Record<string, boolean> }>(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchOpenAI('/moderations', {
      model: env.OPENAI_MODEL_MODERATION,
      input,
    }, Math.min(env.OPENAI_AI_TIMEOUT_MS, 2500));

    const result = Array.isArray(data.results) ? data.results[0] as Record<string, unknown> : {};
    const moderation = {
      flagged: Boolean(result?.flagged),
      categories: (result?.categories as Record<string, boolean>) ?? {},
    };
    setCached(cacheKey, moderation, env.AI_CACHE_TTL_MS);
    return moderation;
  } catch (error) {
    console.error('[moderateText] moderation unavailable, allowing request', error);
    return { flagged: false, categories: {} };
  }
}

export async function createEmbeddings(input: string[]) {
  if (!env.OPENAI_API_KEY || !input.length) return [];
  const cacheKey = `embeddings:${JSON.stringify(input)}`;
  const cached = getCached<number[][]>(cacheKey);
  if (cached) return cached;

  const data = await withRetries(() => fetchOpenAI('/embeddings', {
    model: env.OPENAI_MODEL_EMBEDDINGS,
    input,
  }, env.OPENAI_EMBEDDING_TIMEOUT_MS));

  const vectors = Array.isArray(data.data)
    ? data.data.map((item) => Array.isArray((item as Record<string, unknown>).embedding) ? ((item as Record<string, unknown>).embedding as number[]) : [])
    : [];
  setCached(cacheKey, vectors, env.AI_CACHE_TTL_MS);
  return vectors;
}

export async function createStructuredResponse<T>(args: {
  model: string;
  messages: AIMessage[];
  schema: ResponseSchema;
  tools?: AIToolDefinition[];
  cacheKey?: string;
  store?: boolean;
  maxOutputTokens?: number;
}): Promise<T> {
  const { model, messages, schema, tools = [], cacheKey, store = env.OPENAI_STORE_RESPONSES, maxOutputTokens } = args;
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');

  if (cacheKey) {
    const cached = getCached<T>(cacheKey);
    if (cached) return cached;
  }

  // Only store when tools are involved — storing plain structured responses adds latency with no benefit
  const shouldStore = tools.length > 0 ? (store || env.OPENAI_STORE_RESPONSES) : false;

  const toolSpecs = tools.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));

  const runSingle = async (previousResponseId?: string, toolOutputs?: Array<{ callId: string; output: unknown }>) => {
    const payload: Record<string, unknown> = {
      model,
      store: shouldStore,
      input: previousResponseId
        ? toolOutputs?.map((toolOutput) => ({
            type: 'function_call_output',
            call_id: toolOutput.callId,
            output: JSON.stringify(toolOutput.output),
          })) ?? []
        : messages.map((message) => ({ role: message.role, content: message.content })),
      text: { format: schemaFormat(schema) },
    };

    if (maxOutputTokens) payload.max_output_tokens = maxOutputTokens;
    if (toolSpecs.length) payload.tools = toolSpecs;
    if (previousResponseId) payload.previous_response_id = previousResponseId;

    return withRetries(() => fetchOpenAI('/responses', payload, env.OPENAI_AI_TIMEOUT_MS));
  };

  let response = await runSingle();
  for (let iteration = 0; iteration < 4; iteration++) {
    const toolCalls = readToolCalls(response);
    if (!toolCalls.length) break;

    const toolOutputs = [];
    for (const call of toolCalls) {
      const tool = tools.find((item) => item.name === call.name);
      if (!tool) {
        toolOutputs.push({ callId: call.callId, output: { error: `Unknown tool: ${call.name}` } });
        continue;
      }
      const args = JSON.parse(call.argumentsJson || '{}') as Record<string, unknown>;
      const output = await tool.handler(args);
      toolOutputs.push({ callId: call.callId, output });
    }

    response = await runSingle(String(response.id), toolOutputs);
  }

  const text = readOutputText(response);
  if (!text) {
    throw new Error('Responses API returned no output text.');
  }

  const parsed = JSON.parse(text) as T;
  if (cacheKey) setCached(cacheKey, parsed, env.AI_CACHE_TTL_MS);
  return parsed;
}
