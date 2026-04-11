import { describe, it, expect, beforeEach } from 'vitest';

// Must be set before importing jwt module so env.ts doesn't throw
beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-for-unit-tests-only';
});

describe('JWT sign / verify', () => {
  it('round-trips a session payload', async () => {
    // Dynamic import so env is set before module initialization
    const { signToken, verifyToken } = await import('../lib/auth/jwt');
    const payload = {
      _id: 'abc123',
      name: 'Test User',
      email: 'test@example.com',
      role: 'reader' as const,
      plan: 'free' as const,
      sub_status: 'none' as const,
    };

    const token = await signToken(payload);
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // JWT has 3 parts

    const verified = await verifyToken(token);
    expect(verified).not.toBeNull();
    expect(verified!._id).toBe('abc123');
    expect(verified!.name).toBe('Test User');
    expect(verified!.role).toBe('reader');
  });

  it('returns null for a tampered token', async () => {
    const { signToken, verifyToken } = await import('../lib/auth/jwt');
    const payload = {
      _id: 'x', name: 'X', email: 'x@x.com',
      role: 'reader' as const, plan: 'free' as const, sub_status: 'none' as const,
    };
    const token = await signToken(payload);
    const tampered = token.slice(0, -5) + 'XXXXX';
    const result = await verifyToken(tampered);
    expect(result).toBeNull();
  });

  it('returns null for a garbage string', async () => {
    const { verifyToken } = await import('../lib/auth/jwt');
    expect(await verifyToken('not.a.jwt')).toBeNull();
    expect(await verifyToken('')).toBeNull();
  });
});

describe('cookieOptions', () => {
  it('returns httpOnly=true and correct maxAge', async () => {
    const { cookieOptions, EXPIRY_SECS } = await import('../lib/auth/jwt');
    const opts = cookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.maxAge).toBe(EXPIRY_SECS);
    expect(opts.path).toBe('/');
    expect(opts.sameSite).toBe('lax');
  });
});
