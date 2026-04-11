/**
 * Startup environment validation.
 * Import this module in any server entry-point that needs guaranteed config.
 * In production, missing REQUIRED vars cause an immediate process exit.
 */

const isProd = process.env.NODE_ENV === 'production';

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value) return value;
  if (!isProd && fallback !== undefined) {
    console.warn(`[env] ${name} not set — using dev fallback. Set it before deploying to production.`);
    return fallback;
  }
  const msg = `[env] FATAL: Required environment variable "${name}" is not set.`;
  if (isProd) {
    console.error(msg);
    process.exit(1);
  }
  throw new Error(msg);
}

export const env = {
  NODE_ENV:         process.env.NODE_ENV ?? 'development',
  IS_PROD:          isProd,
  IS_DEV:           !isProd,

  // Auth — required in production
  JWT_SECRET:       requireEnv('JWT_SECRET', 'kyc-dev-secret-unsafe-change-for-production'),

  // Database — optional: app runs in demo mode without it
  MONGODB_URI:      process.env.MONGODB_URI ?? '',

  // Predictor sidecar
  MANDI_SERVICE_URL: process.env.MANDI_SERVICE_URL ?? 'http://localhost:4000',

  // AI features — optional, degrade gracefully
  OPENAI_API_KEY:   process.env.OPENAI_API_KEY ?? '',

  // Site
  SITE_NAME:        process.env.NEXT_PUBLIC_SITE_NAME ?? 'Know Your Commodity',
  BASE_URL:         process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000',

  // Stripe — optional in dev; required when payments are enabled
  STRIPE_SECRET_KEY:      process.env.STRIPE_SECRET_KEY ?? '',
  STRIPE_WEBHOOK_SECRET:  process.env.STRIPE_WEBHOOK_SECRET ?? '',
  STRIPE_PRICE_MONTHLY:   process.env.STRIPE_PRICE_MONTHLY ?? '',
  STRIPE_PRICE_ANNUAL:    process.env.STRIPE_PRICE_ANNUAL  ?? '',

  // Cloudflare R2 — optional in dev (falls back to public/uploads/)
  R2_ENDPOINT:          process.env.R2_ENDPOINT          ?? '',
  R2_ACCESS_KEY_ID:     process.env.R2_ACCESS_KEY_ID     ?? '',
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? '',
  R2_BUCKET:            process.env.R2_BUCKET            ?? '',
  R2_PUBLIC_URL:        process.env.R2_PUBLIC_URL        ?? '',

  // Demo mode: true when DB is not configured
  get IS_DEMO(): boolean { return !this.MONGODB_URI; },
  // Stripe mode: true when Stripe key is present
  get STRIPE_ENABLED(): boolean { return !!this.STRIPE_SECRET_KEY; },
  // R2 mode: true when all R2 vars are set
  get R2_ENABLED(): boolean {
    return !!(this.R2_ENDPOINT && this.R2_ACCESS_KEY_ID && this.R2_SECRET_ACCESS_KEY && this.R2_BUCKET);
  },
} as const;
