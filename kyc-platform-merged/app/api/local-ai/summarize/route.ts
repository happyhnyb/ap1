import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { summarizeTextWithOllama } from '@/lib/local-ai/ollama';
import { env } from '@/lib/env';
import { getInternalApiAuthError, isInternalApiRequestAuthorized } from '@/lib/server/internal-auth';

const BodySchema = z.object({
  text: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  if (!isInternalApiRequestAuthorized(req)) {
    return NextResponse.json(getInternalApiAuthError(), { status: 401 });
  }

  try {
    const body = BodySchema.parse(await req.json());

    // When Ollama is a localhost URL but a Mac Mini backend is configured, proxy the
    // request there so the Mac Mini's local Ollama handles the actual inference.
    const isLocalOllama = /^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(env.OLLAMA_BASE_URL);
    if (isLocalOllama && env.MAC_MINI_API_BASE_URL) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5_000);
        const macRes = await fetch(`${env.MAC_MINI_API_BASE_URL.replace(/\/$/, '')}/api/local-ai/summarize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(env.INTERNAL_API_KEY ? { 'x-internal-api-key': env.INTERNAL_API_KEY } : {}),
          },
          body: JSON.stringify({ text: body.text }),
          cache: 'no-store',
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        return NextResponse.json(await macRes.json(), { status: macRes.status });
      } catch {
        // Mac Mini unreachable — fall through to local Ollama / text fallback below
      }
    }

    const result = await summarizeTextWithOllama(body.text);

    return NextResponse.json({
      success: true,
      data: result.data,
      provider: 'ollama',
      model: env.OLLAMA_MODEL,
      fallback: result.fallback,
      ...(result.error ? { warning: result.error } : {}),
    });
  } catch (error) {
    console.error('[POST /api/local-ai/summarize]', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Summary failed',
      fallback: true,
    }, { status: 400 });
  }
}
