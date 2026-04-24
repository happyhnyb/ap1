import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSafeUserText } from '@/lib/ai/moderation';
import { explainForecast } from '@/lib/ai/service';
import { getInternalApiAuthError, isInternalApiRequestAuthorized } from '@/lib/server/internal-auth';

const BodySchema = z.object({
  commodity: z.string().min(1),
  state: z.string().optional(),
  market: z.string().optional(),
  district: z.string().optional(),
  horizon: z.number().int().min(1).max(14).optional(),
  question: z.string().max(300).optional(),
});

export async function POST(req: NextRequest) {
  if (!isInternalApiRequestAuthorized(req)) {
    return NextResponse.json(getInternalApiAuthError(), { status: 401 });
  }

  try {
    const body = BodySchema.parse(await req.json());
    if (body.question) await assertSafeUserText(body.question, 'forecast question');
    const response = await explainForecast(body);
    return NextResponse.json(response);
  } catch (error) {
    console.error('[POST /api/internal/forecast-explain]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Forecast explanation failed.' }, { status: 400 });
  }
}
