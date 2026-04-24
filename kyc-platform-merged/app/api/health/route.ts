import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { checkOllamaHealth } from '@/lib/local-ai/ollama';

async function checkPredictorHealth() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${env.MANDI_SERVICE_URL.replace(/\/$/, '')}/health`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const [ollama, predictor] = await Promise.all([
    checkOllamaHealth().then((result) => result.ok).catch(() => false),
    checkPredictorHealth(),
  ]);

  return NextResponse.json({
    ok: true,
    service: 'kyc-platform',
    time: new Date().toISOString(),
    ollama,
    predictor,
  });
}
