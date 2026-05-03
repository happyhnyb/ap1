import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runCopilot } from '@/lib/ai/service';
import { assertSafeUserText } from '@/lib/ai/moderation';
import { getServerSession } from '@/lib/auth/jwt';
import { hasFreshPremiumAccess, premiumAIAccessError } from '@/lib/auth/premium-access';
import { postToMacMini, shouldProxyToMacMini } from '@/lib/server/mac-mini';

const BodySchema = z.object({
  query: z.string().min(1).max(300),
  persona: z.enum(['farmer', 'trader', 'procurement', 'general']).default('general'),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!(await hasFreshPremiumAccess(session, 'POST /api/ai/copilot'))) {
    return NextResponse.json({ error: premiumAIAccessError(session) }, { status: session ? 403 : 401 });
  }

  try {
    const body = BodySchema.parse(await req.json());
    const response = shouldProxyToMacMini()
      ? await postToMacMini('/api/internal/copilot', body)
      : await (async () => {
          await assertSafeUserText(body.query, 'copilot query');
          return runCopilot(body.query, body.persona, { enableTools: true });
        })();
    return NextResponse.json(response);
  } catch (error) {
    console.error('[POST /api/ai/copilot]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Copilot failed.' }, { status: 400 });
  }
}
