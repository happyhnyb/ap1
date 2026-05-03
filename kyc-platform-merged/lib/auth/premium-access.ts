import 'server-only';

import type { SessionPayload } from '@/lib/auth/jwt';
import { usersAdapter } from '@/lib/adapters';
import { isPremium, isPremiumUser } from '@/lib/auth/entitlement';

export async function hasFreshPremiumAccess(
  session: SessionPayload | null,
  logContext?: string,
): Promise<boolean> {
  if (!session) return false;
  if (isPremium(session)) return true;

  try {
    const user = await usersAdapter.getByEmail(session.email);
    return isPremiumUser(user);
  } catch (error) {
    if (logContext) {
      console.error(`[${logContext}] premium DB check failed, falling back to session entitlement`, error);
    }
    return false;
  }
}

export function premiumAIAccessError(session: SessionPayload | null): string {
  return session
    ? 'AI features are available on premium plans only.'
    : 'Sign in with a premium account to use AI features.';
}
