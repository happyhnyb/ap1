/**
 * In-memory sliding-window rate limiter.
 *
 * Production note: This works correctly for single-instance deployments.
 * For multi-instance deployments, swap the store for a Redis-backed
 * implementation (e.g. @upstash/ratelimit) — the interface is identical.
 *
 * Usage:
 *   const result = await rateLimit(req, 'login', { limit: 5, windowSecs: 60 });
 *   if (!result.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
 */
import { NextRequest } from 'next/server';

interface WindowEntry {
  count:      number;
  windowStart: number;
}

const store = new Map<string, WindowEntry>();

// Periodically evict expired entries so the map doesn't grow unbounded
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.windowStart > 10 * 60 * 1000) store.delete(key);
    }
  }, 5 * 60 * 1000); // run every 5 min
}

export interface RateLimitOptions {
  /** Max requests per window */
  limit: number;
  /** Window size in seconds */
  windowSecs: number;
}

export interface RateLimitResult {
  ok:        boolean;
  remaining: number;
  resetAt:   number; // unix ms
}

/**
 * Check and increment the rate limit counter for the given key + namespace.
 * Returns { ok: false } if the limit is exceeded.
 */
export function checkRateLimit(
  key: string,
  namespace: string,
  opts: RateLimitOptions
): RateLimitResult {
  const mapKey = `${namespace}:${key}`;
  const now    = Date.now();
  const windowMs = opts.windowSecs * 1000;

  const entry = store.get(mapKey);

  if (!entry || now - entry.windowStart >= windowMs) {
    // New window
    store.set(mapKey, { count: 1, windowStart: now });
    return { ok: true, remaining: opts.limit - 1, resetAt: now + windowMs };
  }

  if (entry.count >= opts.limit) {
    return { ok: false, remaining: 0, resetAt: entry.windowStart + windowMs };
  }

  entry.count++;
  return { ok: true, remaining: opts.limit - entry.count, resetAt: entry.windowStart + windowMs };
}

/** Extract a stable client identifier from a Next.js request. */
export function getClientId(req: NextRequest): string {
  // Prefer forwarded IP (set by reverse proxies / Vercel / Cloudflare)
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

// ── Pre-configured limiters for common endpoints ─────────────────

export const LIMITS = {
  /** Strict: 5 attempts per minute (login, register) */
  auth:      { limit: 5,  windowSecs: 60  },
  /** Contact form: 3 per 10 minutes */
  contact:   { limit: 3,  windowSecs: 600 },
  /** AI search: 10 per minute per IP */
  aiSearch:  { limit: 10, windowSecs: 60  },
  /** Predictor: 30 per minute (heavier computation) */
  predictor: { limit: 30, windowSecs: 60  },
} as const;
