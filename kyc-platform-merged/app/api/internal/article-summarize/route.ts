import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { summarizeArticle } from '@/lib/ai/service';
import { getInternalApiAuthError, isInternalApiRequestAuthorized } from '@/lib/server/internal-auth';

const BodySchema = z.object({
  slug: z.string().min(1),
  persona: z.enum(['farmer', 'trader', 'procurement', 'general']).default('general'),
});

export async function POST(req: NextRequest) {
  if (!isInternalApiRequestAuthorized(req)) {
    return NextResponse.json(getInternalApiAuthError(), { status: 401 });
  }

  try {
    const body = BodySchema.parse(await req.json());
    const response = await summarizeArticle(body.slug, body.persona);
    return NextResponse.json(response);
  } catch (error) {
    console.error('[POST /api/internal/article-summarize]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Summary failed.' }, { status: 400 });
  }
}
