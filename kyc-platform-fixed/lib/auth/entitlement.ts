import type { SessionPayload } from './jwt';

/**
 * Returns true if the session belongs to a user with active premium access
 * (premium subscriber, editor, or admin).
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
