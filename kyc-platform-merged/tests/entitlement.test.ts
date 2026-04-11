import { describe, it, expect } from 'vitest';
import {
  isPremium,
  isAdmin,
  isEditor,
  canAccessPost,
  canAccessPredictor,
  canAccessAISearch,
  tierLabel,
} from '../lib/auth/entitlement';
import type { SessionPayload } from '../lib/auth/jwt';

const makeSession = (overrides: Partial<SessionPayload>): SessionPayload => ({
  _id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  role: 'reader',
  plan: 'free',
  sub_status: 'none',
  ...overrides,
});

describe('isPremium', () => {
  it('returns false for null session', () => {
    expect(isPremium(null)).toBe(false);
  });

  it('returns false for free reader', () => {
    expect(isPremium(makeSession({ role: 'reader' }))).toBe(false);
  });

  it('returns true for active premium subscriber', () => {
    expect(isPremium(makeSession({ role: 'premium', sub_status: 'active' }))).toBe(true);
  });

  it('returns false for expired premium', () => {
    expect(isPremium(makeSession({ role: 'premium', sub_status: 'expired' }))).toBe(false);
  });

  it('returns true for editor', () => {
    expect(isPremium(makeSession({ role: 'editor' }))).toBe(true);
  });

  it('returns true for admin', () => {
    expect(isPremium(makeSession({ role: 'admin' }))).toBe(true);
  });
});

describe('isAdmin', () => {
  it('returns true only for admin role', () => {
    expect(isAdmin(makeSession({ role: 'admin' }))).toBe(true);
    expect(isAdmin(makeSession({ role: 'editor' }))).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});

describe('isEditor', () => {
  it('returns true for editor and admin', () => {
    expect(isEditor(makeSession({ role: 'editor' }))).toBe(true);
    expect(isEditor(makeSession({ role: 'admin' }))).toBe(true);
  });

  it('returns false for reader and premium', () => {
    expect(isEditor(makeSession({ role: 'reader' }))).toBe(false);
    expect(isEditor(makeSession({ role: 'premium', sub_status: 'active' }))).toBe(false);
    expect(isEditor(null)).toBe(false);
  });
});

describe('canAccessPost', () => {
  it('allows anyone to access free posts', () => {
    expect(canAccessPost(null, false)).toBe(true);
    expect(canAccessPost(makeSession({ role: 'reader' }), false)).toBe(true);
  });

  it('blocks unauthenticated users from premium posts', () => {
    expect(canAccessPost(null, true)).toBe(false);
  });

  it('blocks free readers from premium posts', () => {
    expect(canAccessPost(makeSession({ role: 'reader' }), true)).toBe(false);
  });

  it('allows active premium subscribers to access premium posts', () => {
    expect(canAccessPost(makeSession({ role: 'premium', sub_status: 'active' }), true)).toBe(true);
  });

  it('allows editors and admins to access premium posts', () => {
    expect(canAccessPost(makeSession({ role: 'editor' }), true)).toBe(true);
    expect(canAccessPost(makeSession({ role: 'admin' }), true)).toBe(true);
  });
});

describe('canAccessPredictor / canAccessAISearch', () => {
  it('blocks non-premium users', () => {
    expect(canAccessPredictor(null)).toBe(false);
    expect(canAccessAISearch(null)).toBe(false);
    expect(canAccessPredictor(makeSession({ role: 'reader' }))).toBe(false);
  });

  it('allows premium, editor, admin', () => {
    const activeP = makeSession({ role: 'premium', sub_status: 'active' });
    expect(canAccessPredictor(activeP)).toBe(true);
    expect(canAccessAISearch(activeP)).toBe(true);
    expect(canAccessPredictor(makeSession({ role: 'admin' }))).toBe(true);
  });
});

describe('tierLabel', () => {
  it('returns Guest for null', () => {
    expect(tierLabel(null)).toBe('Guest');
  });

  it('returns Free for reader', () => {
    expect(tierLabel(makeSession({ role: 'reader' }))).toBe('Free');
  });

  it('returns Pro for active premium', () => {
    expect(tierLabel(makeSession({ role: 'premium', sub_status: 'active' }))).toBe('Pro');
  });

  it('returns Free for expired premium', () => {
    expect(tierLabel(makeSession({ role: 'premium', sub_status: 'expired' }))).toBe('Free');
  });

  it('returns Editor for editor', () => {
    expect(tierLabel(makeSession({ role: 'editor' }))).toBe('Editor');
  });

  it('returns Admin for admin', () => {
    expect(tierLabel(makeSession({ role: 'admin' }))).toBe('Admin');
  });
});
