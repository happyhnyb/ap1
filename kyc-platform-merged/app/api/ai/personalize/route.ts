import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { personalizeFeed } from '@/lib/ai/service';
import { getServerSession } from '@/lib/auth/jwt';

const BodySchema = z.object({
  persona: z.enum(['farmer', 'trader', 'procurement', 'general']).default('general'),
  interests: z.array(z.string().min(1)).max(8).default([]),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  try {
    const body = BodySchema.parse(await req.json());
    const response = await personalizeFeed(body);
    return NextResponse.json(response);
  } catch (error) {
    console.error('[POST /api/ai/personalize]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Personalization failed.' }, { status: 400 });
  }
}

