import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/jwt';
import { assertSafeUserText } from '@/lib/ai/moderation';
import { explainForecast } from '@/lib/ai/service';
import { canAccessPredictorRelease, predictorAccessError } from '@/lib/product/predictor';

const BodySchema = z.object({
  commodity: z.string().min(1),
  state: z.string().optional(),
  market: z.string().optional(),
  district: z.string().optional(),
  horizon: z.number().int().min(1).max(14).optional(),
  question: z.string().max(300).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!canAccessPredictorRelease(session)) {
    return NextResponse.json({ error: predictorAccessError(session) }, { status: 403 });
  }

  try {
    const body = BodySchema.parse(await req.json());
    if (body.question) await assertSafeUserText(body.question, 'forecast question');
    const response = await explainForecast(body);
    return NextResponse.json(response);
  } catch (error) {
    console.error('[POST /api/ai/forecast-explain]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Forecast explanation failed.' }, { status: 400 });
  }
}
