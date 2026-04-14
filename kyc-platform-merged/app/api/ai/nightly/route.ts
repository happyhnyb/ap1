import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { runNightlyAIPipeline } from '@/scripts/ai-nightly-shared';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (!env.AI_BATCH_SECRET || auth !== `Bearer ${env.AI_BATCH_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runNightlyAIPipeline();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[POST /api/ai/nightly]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Nightly pipeline failed.' }, { status: 500 });
  }
}

