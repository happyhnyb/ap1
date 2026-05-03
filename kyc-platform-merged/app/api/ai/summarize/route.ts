import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { summarizeArticle } from '@/lib/ai/service';
import { getServerSession } from '@/lib/auth/jwt';
import { hasFreshPremiumAccess, premiumAIAccessError } from '@/lib/auth/premium-access';
import { postToMacMini, shouldProxyToMacMini } from '@/lib/server/mac-mini';

const BodySchema = z.object({
  slug: z.string().min(1),
  persona: z.enum(['farmer', 'trader', 'procurement', 'general']).default('general'),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!(await hasFreshPremiumAccess(session, 'POST /api/ai/summarize'))) {
    return NextResponse.json({ error: premiumAIAccessError(session) }, { status: session ? 403 : 401 });
  }

  try {
    const body = BodySchema.parse(await req.json());
    const response = shouldProxyToMacMini()
      ? await postToMacMini('/api/internal/article-summarize', body)
      : await summarizeArticle(body.slug, body.persona);
    return NextResponse.json(response);
  } catch (error) {
    console.error('[POST /api/ai/summarize]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Summary failed.' }, { status: 400 });
  }
}
