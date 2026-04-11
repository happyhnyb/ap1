import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('allows requests within the limit', async () => {
    const { checkRateLimit } = await import('../lib/ratelimit');
    const opts = { limit: 3, windowSecs: 60 };

    const r1 = checkRateLimit('test-key', 'test', opts);
    const r2 = checkRateLimit('test-key', 'test', opts);
    const r3 = checkRateLimit('test-key', 'test', opts);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);
  });

  it('blocks after limit is exceeded', async () => {
    const { checkRateLimit } = await import('../lib/ratelimit');
    const opts = { limit: 2, windowSecs: 60 };
    const key = `block-test-${Date.now()}`;

    checkRateLimit(key, 'bl', opts);
    checkRateLimit(key, 'bl', opts);
    const r = checkRateLimit(key, 'bl', opts);
    expect(r.ok).toBe(false);
  });

  it('provides resetAt timestamp in the future', async () => {
    const { checkRateLimit } = await import('../lib/ratelimit');
    const opts = { limit: 1, windowSecs: 60 };
    const key = `reset-test-${Date.now()}`;

    const r = checkRateLimit(key, 'rst', opts);
    expect(r.resetAt).toBeGreaterThan(Date.now());
  });

  it('isolates keys in different namespaces', async () => {
    const { checkRateLimit } = await import('../lib/ratelimit');
    const opts = { limit: 1, windowSecs: 60 };
    const key = `ns-test-${Date.now()}`;

    const r1 = checkRateLimit(key, 'ns-a', opts);
    const r2 = checkRateLimit(key, 'ns-b', opts);
    // Each namespace gets its own counter — both should succeed
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });
});

describe('getClientId', () => {
  it('extracts first IP from x-forwarded-for header', async () => {
    const { getClientId } = await import('../lib/ratelimit');
    const req = { headers: { get: (h: string) => h === 'x-forwarded-for' ? '1.2.3.4, 5.6.7.8' : null } } as any;
    expect(getClientId(req)).toBe('1.2.3.4');
  });

  it('falls back to unknown when no header', async () => {
    const { getClientId } = await import('../lib/ratelimit');
    const req = { headers: { get: () => null } } as any;
    expect(getClientId(req)).toBe('unknown');
  });
});
