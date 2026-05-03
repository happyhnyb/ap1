import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/jwt';
import { isEditor } from '@/lib/auth/entitlement';
import { getInternalApiAuthError, isInternalApiRequestAuthorized } from '@/lib/server/internal-auth';
import { env } from '@/lib/env';
import { parseNaturalDateInput } from '@/lib/posts/publish-date';
import { parseNaturalDateWithOllama } from '@/lib/local-ai/ollama';

const BodySchema = z.object({
  text: z.string().trim().min(1).max(80),
});

async function ensureAuthorized(req: NextRequest) {
  const session = await getServerSession();
  return isEditor(session) || isInternalApiRequestAuthorized(req);
}

export async function POST(req: NextRequest) {
  if (!(await ensureAuthorized(req))) {
    return NextResponse.json(getInternalApiAuthError(), { status: 401 });
  }

  try {
    const body = BodySchema.parse(await req.json());

    const deterministic = parseNaturalDateInput(body.text);
    const isLocalOllama = /^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(env.OLLAMA_BASE_URL);

    if (isLocalOllama && env.MAC_MINI_API_BASE_URL && !isInternalApiRequestAuthorized(req)) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5_000);
        const macRes = await fetch(`${env.MAC_MINI_API_BASE_URL.replace(/\/$/, '')}/api/local-ai/parse-date`, {
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
        // Fall through to local parsing below.
      }
    }

    try {
      const result = await parseNaturalDateWithOllama(body.text);
      return NextResponse.json({
        success: true,
        dateOnly: result.data.dateOnly,
        iso: result.data.iso,
        source: 'ollama',
        fallback: result.fallback,
        ...(result.error ? { warning: result.error } : {}),
      });
    } catch (error) {
      if (!deterministic) {
        throw error;
      }
    }

    if (!deterministic) {
      return NextResponse.json({ success: false, error: 'Could not parse that date.' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      dateOnly: deterministic.dateOnly,
      iso: deterministic.iso,
      source: 'deterministic',
      fallback: true,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Could not parse that date.',
    }, { status: 400 });
  }
}
