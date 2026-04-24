import 'server-only';

import { NextRequest } from 'next/server';
import { env } from '@/lib/env';

function extractBearerToken(header: string | null) {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export function isInternalApiRequestAuthorized(req: NextRequest) {
  if (!env.INTERNAL_API_KEY) {
    return !env.IS_PROD;
  }

  const headerToken =
    req.headers.get('x-internal-api-key')?.trim()
    || extractBearerToken(req.headers.get('authorization'));

  return headerToken === env.INTERNAL_API_KEY;
}

export function getInternalApiAuthError() {
  return {
    success: false,
    error: 'Unauthorized internal API request.',
  };
}
