import type { SessionPayload } from './jwt';
import type { User } from '@/types/user';

/**
 * Returns true if the session belongs to a user with active premium access
 * (premium subscriber, editor, or admin).
 *
 * NOTE: JWT tokens are short-lived (7 days) but subscription state can change
 * (cancel, payment failure) between token issuance and expiry.
 * For high-stakes access checks (predictor, AI search), use
 * `isPremiumFresh()` which re-validates against the database.
 */
export function isPremium(session: SessionPayload | null): boolean {
  if (!session) return false;
  if (['admin', 'editor'].includes(session.role)) return true;
  return session.role === 'premium' && session.sub_status === 'active';
}

export function isAdmin(session: SessionPayload | null): boolean {
  return session?.role === 'admin';
}

export function isEditor(session: SessionPayload | null): boolean {
  return !!session && ['admin', 'editor'].includes(session.role);
}

export function canAccessPost(
  session: SessionPayload | null,
  is_premium_post: boolean
): boolean {
  if (!is_premium_post) return true;
  return isPremium(session);
}

export function canAccessPredictor(session: SessionPayload | null): boolean {
  return isPremium(session);
}

export function canAccessAISearch(session: SessionPayload | null): boolean {
  return isPremium(session);
}

export function tierLabel(session: SessionPayload | null): string {
  if (!session) return 'Guest';
  if (['admin', 'editor'].includes(session.role)) return session.role.charAt(0).toUpperCase() + session.role.slice(1);
  if (session.role === 'premium' && session.sub_status === 'active') return 'Pro';
  return 'Free';
}

/**
 * Server-side premium check against live DB record.
 * Use this in premium API routes to catch subscription changes that haven't
 * yet caused a token refresh (e.g. cancellation, payment failure).
 *
 * Admin and editor roles bypass the subscription check.
 * Always returns false when the user record cannot be found.
 */
export function isPremiumUser(user: User | null): boolean {
  if (!user) return false;
  if (['admin', 'editor'].includes(user.role)) return true;
  if (user.role !== 'premium') return false;
  if (user.subscription.status !== 'active') return false;
  // Check expiry date if present
  if (user.subscription.expires_at) {
    const expires = new Date(user.subscription.expires_at);
    if (expires < new Date()) return false;
  }
  return true;
}
