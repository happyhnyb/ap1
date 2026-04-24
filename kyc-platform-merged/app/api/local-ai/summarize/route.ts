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
