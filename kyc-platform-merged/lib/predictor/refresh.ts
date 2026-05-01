import 'server-only';

import { revalidatePath } from 'next/cache';
import { env } from '@/lib/env';

const PREDICTOR_PATHS = [
  '/premium/predictor',
  '/api/predictor/options',
  '/api/predictor/summary',
  '/api/predictor/history',
  '/api/predictor/forecast',
  '/api/predictor/status',
] as const;

export async function refreshPredictorData() {
  const cronSecret = process.env.CRON_SECRET;
  const baseUrl = env.BASE_URL.replace(/\/$/, '');
  let refreshResult: unknown = null;

  if (cronSecret && baseUrl) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);

    try {
      const response = await fetch(`${baseUrl}/api/cron/refresh-mandi`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
        cache: 'no-store',
        signal: controller.signal,
      });

      refreshResult = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(`Refresh failed (${response.status}).`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  for (const path of PREDICTOR_PATHS) {
    revalidatePath(path);
  }

  return {
    ok: true,
    refreshed: Boolean(refreshResult),
    message: refreshResult
      ? 'Predictor data refresh triggered and caches cleared.'
      : 'Predictor caches cleared.',
    refresh: refreshResult,
  };
}
