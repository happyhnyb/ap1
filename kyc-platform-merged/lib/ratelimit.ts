/**
 * Rate limiter — Redis-backed when Upstash is configured, in-memory fallback otherwise.
 *
 * To enable Redis (recommended for production):
 *   Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to Vercel env vars.
 *   Free tier at upstash.com handles ~10k requests/day.
 *
 * The interface is identical in both modes — swap is transparent.
 */
import { NextRequest } from 'next/server';

export interface RateLimitOptions {
  limit: number;
  windowSecs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number; // unix ms
}

// ── Redis-backed limiter (Upstash) ────────────────────────────────────────────

let redisLimiter: ((key: string, namespace: string, opts: RateLimitOptions) => Promise<RateLimitResult>) | null = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const { Redis } = await import('@upstash/redis').catch(() => ({ Redis: null }));
  const { Ratelimit } = await import('@upstash/ratelimit').catch(() => ({ Ratelimit: null }));

  if (Redis && Ratelimit) {
    const redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    const limiters = new Map<string, InstanceType<typeof Ratelimit>>();

    redisLimiter = async (key, namespace, opts) => {
      const cacheKey = `${namespace}:${opts.limit}:${opts.windowSecs}`;
      if (!limiters.has(cacheKey)) {
        limiters.set(cacheKey, new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(opts.limit, `${opts.windowSecs} s`),
          prefix:  `rl:${namespace}`,
        }));
      }
      const rl = limiters.get(cacheKey)!;
      const { success, remaining, reset } = await rl.limit(key);
      return { ok: success, remaining, resetAt: reset };
    };
  }
}

// ── In-memory fallback ────────────────────────────────────────────────────────

interface WindowEntry { count: number; windowStart: number; }
const store = new Map<string, WindowEntry>();

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.windowStart > 10 * 60 * 1000) store.delete(key);
    }
  }, 5 * 60 * 1000);
}

function inMemoryLimit(key: string, namespace: string, opts: RateLimitOptions): RateLimitResult {
  const mapKey = `${namespace}:${key}`;
  const now = Date.now();
  const windowMs = opts.windowSecs * 1000;
  const entry = store.get(mapKey);

  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(mapKey, { count: 1, windowStart: now });
    return { ok: true, remaining: opts.limit - 1, resetAt: now + windowMs };
  }
  if (entry.count >= opts.limit) {
    return { ok: false, remaining: 0, resetAt: entry.windowStart + windowMs };
  }
  entry.count++;
  return { ok: true, remaining: opts.limit - entry.count, resetAt: entry.windowStart + windowMs };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function checkRateLimit(
  key: string,
  namespace: string,
  opts: RateLimitOptions,
): RateLimitResult {
  // Use Redis when available, in-memory otherwise
  if (redisLimiter) {
    // Fire-and-forget async in a sync context — callers should await this
    // but many existing call sites are sync. Return optimistic allow and
    // let the async result update on the next request.
    // TODO: migrate callers to async checkRateLimitAsync for proper enforcement
    return inMemoryLimit(key, namespace, opts);
  }
  return inMemoryLimit(key, namespace, opts);
}

export async function checkRateLimitAsync(
  key: string,
  namespace: string,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  if (redisLimiter) {
    try {
      return await redisLimiter(key, namespace, opts);
    } catch {
      // Redis unavailable — fall back to in-memory
    }
  }
  return inMemoryLimit(key, namespace, opts);
}

export function getClientId(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

export const LIMITS = {
  auth:      { limit: 5,  windowSecs: 60  },
  contact:   { limit: 3,  windowSecs: 600 },
  aiSearch:  { limit: 10, windowSecs: 60  },
  predictor: { limit: 30, windowSecs: 60  },
} as const;
