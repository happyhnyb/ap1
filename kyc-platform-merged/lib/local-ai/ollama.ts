import 'server-only';

import { z } from 'zod';
import { env } from '@/lib/env';

const summarySchema = z.object({
  title: z.string().trim().min(1).max(99),
  summary: z.string().trim().min(1),
  bullets: z.array(z.string().trim().min(1)).length(3),
  tags: z.array(z.string().trim().min(1).max(30)).min(3).max(6),
  category: z.string().trim().min(1),
  trade_takeaway: z.preprocess(
    (value) => typeof value === 'string' && !value.trim() ? undefined : value,
    z.string().trim().min(1).optional(),
  ),
});

const forecastExplanationSchema = z.object({
  answer: z.string().trim().min(1),
  drivers: z.array(z.string().trim().min(1)).min(1).max(4),
  risks: z.array(z.string().trim().min(1)).max(4),
  watchouts: z.array(z.string().trim().min(1)).max(3),
});

export type LocalArticleSummary = z.infer<typeof summarySchema>;
export type LocalForecastExplanation = z.infer<typeof forecastExplanationSchema>;

type OllamaChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function chatEndpoint() {
  return `${env.OLLAMA_BASE_URL.replace(/\/$/, '')}/v1/chat/completions`;
}

function safeJsonParse<T>(content: string): T {
  return JSON.parse(content) as T;
}

async function postToOllama(messages: Array<{ role: 'system' | 'user'; content: string }>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(chatEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        temperature: 0.2,
        messages,
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama request failed (${res.status}): ${text}`);
    }

    return await res.json() as OllamaChatResponse;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestValidatedJson<T>(args: {
  prompt: string;
  schema: z.ZodType<T>;
  retryPrompt?: string;
}): Promise<T> {
  const system = 'You are a strict JSON API. Return ONLY valid JSON. No markdown, no explanations. Do not invent facts.';
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await postToOllama([
      { role: 'system', content: system },
      {
        role: 'user',
        content: attempt === 0 || !args.retryPrompt ? args.prompt : `${args.prompt}\n\n${args.retryPrompt}`,
      },
    ]);

    try {
      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Ollama returned an empty response.');
      }
      const parsed = safeJsonParse<unknown>(content);
      return args.schema.parse(parsed);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Ollama returned invalid JSON.');
}

function extractSentences(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function extractParagraphs(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function fallbackBullets(text: string) {
  const candidates = [...extractParagraphs(text), ...extractSentences(text)]
    .filter((line) => line.length > 20)
    .slice(0, 3);

  while (candidates.length < 3) {
    candidates.push(candidates[candidates.length - 1] ?? 'Local summary fallback used because the AI response was invalid.');
  }

  return candidates.slice(0, 3);
}

function cleanTitle(title: string) {
  return title.replace(/\s+/g, ' ').trim().slice(0, 99) || 'Local market summary';
}

export function buildFallbackSummary(text: string, title = 'Local market summary'): LocalArticleSummary {
  const bullets = fallbackBullets(text);
  const sentences = extractSentences(text);
  const summary = sentences.slice(0, 2).join(' ').trim() || bullets[0];

  return {
    title: cleanTitle(title),
    summary,
    bullets,
    tags: ['local-ai', 'ollama', 'fallback'],
    category: 'Local Analysis',
    trade_takeaway: bullets[0],
  };
}

export async function summarizeTextWithOllama(text: string, hintTitle?: string): Promise<{
  data: LocalArticleSummary;
  fallback: boolean;
  error?: string;
}> {
  const trimmedText = text.trim();
  const prompt = [
    'Summarize the article and return this exact schema:',
    '{"title":"string under 100 characters","summary":"1-2 sentence summary","bullets":["exactly 3 bullet points"],"tags":["3 to 6 short tags"],"category":"string","trade_takeaway":"optional string"}',
    'Rules:',
    '- Use only facts present in the supplied text.',
    '- Keep bullets concise and non-redundant.',
    '- Return exactly 3 bullets.',
    '- Title must be under 100 characters.',
    hintTitle ? `Suggested title context: ${hintTitle}` : '',
    `Article text:\n${trimmedText.slice(0, 8000)}`,
  ].filter(Boolean).join('\n');

  try {
    const data = await requestValidatedJson({
      prompt,
      schema: summarySchema,
      retryPrompt: 'Your previous reply was invalid. Return only a valid JSON object that exactly matches the schema, with exactly 3 bullet strings.',
    });
    return { data, fallback: false };
  } catch (error) {
    console.error('[summarizeTextWithOllama] using fallback summary', error);
    return {
      data: buildFallbackSummary(trimmedText, hintTitle),
      fallback: true,
      error: error instanceof Error ? error.message : 'Invalid Ollama response',
    };
  }
}

export async function explainForecastWithOllama(input: {
  commodity: string;
  state?: string;
  district?: string;
  market?: string;
  horizon: number;
  latestPrice: number | null;
  direction: 'up' | 'down' | 'flat';
  trendPct: number;
  modelUsed: string;
  smape: number | null;
  drivers: string[];
  risks: string[];
  citations: Array<{ title: string; excerpt: string }>;
}): Promise<LocalForecastExplanation> {
  const fallback: LocalForecastExplanation = {
    answer: `${input.commodity} is currently showing a ${input.direction} setup over the next ${input.horizon} days based on the local forecast model. Treat this as directional guidance and verify with live mandi conditions before acting.`,
    drivers: input.drivers.slice(0, 3).length ? input.drivers.slice(0, 3) : ['Recent mandi price trend', 'Model backtest quality', 'Selected market history'],
    risks: input.risks.slice(0, 2),
    watchouts: [
      `Model: ${input.modelUsed}`,
      input.smape != null ? `Backtest sMAPE: ${input.smape.toFixed(1)}%` : 'Backtest quality still limited',
    ].slice(0, 3),
  };

  const prompt = [
    'Return JSON with this exact schema:',
    '{"answer":"short paragraph","drivers":["1 to 4 items"],"risks":["0 to 4 items"],"watchouts":["0 to 3 items"]}',
    'Use only the supplied forecast facts. Do not invent news or prices.',
    `Commodity: ${input.commodity}`,
    `State: ${input.state ?? 'All states'}`,
    `City: ${input.district ?? 'All cities'}`,
    `Market: ${input.market ?? 'All markets'}`,
    `Horizon: ${input.horizon} days`,
    `Latest price: ${input.latestPrice ?? 'unknown'}`,
    `Direction: ${input.direction}`,
    `Trend percent: ${input.trendPct.toFixed(1)}%`,
    `Model: ${input.modelUsed}`,
    `Backtest sMAPE: ${input.smape != null ? input.smape.toFixed(1) : 'unknown'}`,
    `Drivers: ${JSON.stringify(input.drivers.slice(0, 4))}`,
    `Risks: ${JSON.stringify(input.risks.slice(0, 4))}`,
    `Citations: ${JSON.stringify(input.citations.slice(0, 3))}`,
  ].join('\n');

  try {
    return await requestValidatedJson({
      prompt,
      schema: forecastExplanationSchema,
      retryPrompt: 'Your previous reply was invalid. Return only a valid JSON object with answer, drivers, risks, and watchouts.',
    });
  } catch (error) {
    console.error('[explainForecastWithOllama] using fallback explanation', error);
    return fallback;
  }
}

export async function checkOllamaHealth() {
  const baseUrl = env.OLLAMA_BASE_URL.replace(/\/$/, '');
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Ollama health check failed (${res.status})`);
    }

    const data = await res.json() as { models?: Array<{ name?: string; model?: string }> };
    const modelPresent = (data.models ?? []).some((model) => {
      const value = model.name ?? model.model ?? '';
      return value.includes(env.OLLAMA_MODEL);
    });

    if (!modelPresent) {
      throw new Error(`Model "${env.OLLAMA_MODEL}" not found in Ollama.`);
    }

    return { ok: true as const, provider: 'ollama' as const, model: env.OLLAMA_MODEL };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Ollama not reachable',
    };
  }
}
