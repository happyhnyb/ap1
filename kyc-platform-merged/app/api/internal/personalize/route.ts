import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { personalizeFeed } from '@/lib/ai/service';
import { getInternalApiAuthError, isInternalApiRequestAuthorized } from '@/lib/server/internal-auth';

const BodySchema = z.object({
  persona: z.enum(['farmer', 'trader', 'procurement', 'general']).default('general'),
  interests: z.array(z.string().min(1)).max(8).default([]),
});

export async function POST(req: NextRequest) {
  if (!isInternalApiRequestAuthorized(req)) {
    return NextResponse.json(getInternalApiAuthError(), { status: 401 });
  }

  try {
    const body = BodySchema.parse(await req.json());
    const response = await personalizeFeed(body);
    return NextResponse.json(response);
  } catch (error) {
    console.error('[POST /api/internal/personalize]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Personalization failed.' }, { status: 400 });
  }
}
