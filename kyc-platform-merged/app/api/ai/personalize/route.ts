import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { personalizeFeed } from '@/lib/ai/service';
import { getServerSession } from '@/lib/auth/jwt';
import { hasFreshPremiumAccess, premiumAIAccessError } from '@/lib/auth/premium-access';
import { postToMacMini, shouldProxyToMacMini } from '@/lib/server/mac-mini';

const BodySchema = z.object({
  persona: z.enum(['farmer', 'trader', 'procurement', 'general']).default('general'),
  interests: z.array(z.string().min(1)).max(8).default([]),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!(await hasFreshPremiumAccess(session, 'POST /api/ai/personalize'))) {
    return NextResponse.json({ error: premiumAIAccessError(session) }, { status: session ? 403 : 401 });
  }

  try {
    const body = BodySchema.parse(await req.json());
    const response = shouldProxyToMacMini()
      ? await postToMacMini('/api/internal/personalize', body)
      : await personalizeFeed(body);
    return NextResponse.json(response);
  } catch (error) {
    console.error('[POST /api/ai/personalize]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Personalization failed.' }, { status: 400 });
  }
}
