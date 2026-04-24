import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runCopilot } from '@/lib/ai/service';
import { assertSafeUserText } from '@/lib/ai/moderation';
import { getInternalApiAuthError, isInternalApiRequestAuthorized } from '@/lib/server/internal-auth';

const BodySchema = z.object({
  query: z.string().min(1).max(300),
  persona: z.enum(['farmer', 'trader', 'procurement', 'general']).default('general'),
});

export async function POST(req: NextRequest) {
  if (!isInternalApiRequestAuthorized(req)) {
    return NextResponse.json(getInternalApiAuthError(), { status: 401 });
  }

  try {
    const body = BodySchema.parse(await req.json());
    await assertSafeUserText(body.query, 'copilot query');
    const response = await runCopilot(body.query, body.persona, { enableTools: true });
    return NextResponse.json(response);
  } catch (error) {
    console.error('[POST /api/internal/copilot]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Copilot failed.' }, { status: 400 });
  }
}
