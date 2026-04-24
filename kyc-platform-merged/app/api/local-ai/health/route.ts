import { NextResponse } from 'next/server';
import { checkOllamaHealth } from '@/lib/local-ai/ollama';

export async function GET() {
  const health = await checkOllamaHealth();
  if (!health.ok) {
    return NextResponse.json({
      ok: false,
      error: health.error || 'Ollama not reachable',
    }, { status: 503 });
  }

  return NextResponse.json(health);
}
