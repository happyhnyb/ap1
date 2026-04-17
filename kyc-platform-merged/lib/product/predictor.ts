import type { SessionPayload } from '@/lib/auth/jwt';
import { env } from '@/lib/env';
import { isPremium } from '@/lib/auth/entitlement';

export const PREDICTOR_DISCLAIMER =
  'This is an AI generated forecast analysis based on different data sources. It is not financial advice. Kindly recheck and confirm before making any financial decisions.';

export function getPredictorReleaseMode(): 'public' | 'auth' | 'premium' {
  return env.PREDICTOR_RELEASE_MODE;
}

export function canAccessPredictorRelease(session: SessionPayload | null): boolean {
  const mode = getPredictorReleaseMode();
  if (mode === 'public') return true;
  if (mode === 'auth') return !!session;
  return isPremium(session);
}

export function predictorAccessError(session: SessionPayload | null): string {
  const mode = getPredictorReleaseMode();
  if (mode === 'auth' && !session) {
    return 'Sign in to access the predictor.';
  }
  return 'Predictor access is not available for this account.';
}
