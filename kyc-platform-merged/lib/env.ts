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
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',

  // Database — optional: app runs in demo mode without it
  MONGODB_URI:      process.env.MONGODB_URI ?? '',

  // Predictor sidecar
  MANDI_SERVICE_URL: process.env.MANDI_SERVICE_URL ?? 'http://localhost:4000',

  // AI features — optional, degrade gracefully
  OPENAI_API_KEY:   process.env.OPENAI_API_KEY ?? '',
  OPENAI_MODEL_COPILOT: process.env.OPENAI_MODEL_COPILOT ?? 'gpt-5-mini',
  OPENAI_MODEL_EXTRACTION: process.env.OPENAI_MODEL_EXTRACTION ?? 'gpt-5-nano',
  OPENAI_MODEL_SUMMARY: process.env.OPENAI_MODEL_SUMMARY ?? 'gpt-5-nano',
  OPENAI_MODEL_PERSONALIZATION: process.env.OPENAI_MODEL_PERSONALIZATION ?? 'gpt-5-nano',
  OPENAI_MODEL_EMBEDDINGS: process.env.OPENAI_MODEL_EMBEDDINGS ?? 'text-embedding-3-small',
  OPENAI_MODEL_MODERATION: process.env.OPENAI_MODEL_MODERATION ?? 'omni-moderation-latest',
  OPENAI_AI_TIMEOUT_MS: Number(process.env.OPENAI_AI_TIMEOUT_MS ?? '12000'),
  OPENAI_EMBEDDING_TIMEOUT_MS: Number(process.env.OPENAI_EMBEDDING_TIMEOUT_MS ?? '20000'),
  OPENAI_MAX_RETRIES: Number(process.env.OPENAI_MAX_RETRIES ?? '2'),
  OPENAI_STORE_RESPONSES: process.env.OPENAI_STORE_RESPONSES === 'true',
  OPENAI_ENABLE_MODERATION: process.env.OPENAI_ENABLE_MODERATION !== 'false',
  AI_CACHE_TTL_MS: Number(process.env.AI_CACHE_TTL_MS ?? String(1000 * 60 * 30)),
  AI_COPILOT_ENABLED: process.env.AI_COPILOT_ENABLED !== 'false',
  AI_BATCH_SECRET: process.env.AI_BATCH_SECRET ?? '',

  // Site
  SITE_NAME:        process.env.NEXT_PUBLIC_SITE_NAME ?? 'Know Your Commodity',
  BASE_URL:         process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000',
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? '',

  // Stripe — optional in dev; required when payments are enabled
  STRIPE_SECRET_KEY:      process.env.STRIPE_SECRET_KEY ?? '',
  STRIPE_WEBHOOK_SECRET:  process.env.STRIPE_WEBHOOK_SECRET ?? '',
  STRIPE_PRICE_MONTHLY:   process.env.STRIPE_PRICE_MONTHLY ?? '',
  STRIPE_PRICE_ANNUAL:    process.env.STRIPE_PRICE_ANNUAL  ?? '',

  // Razorpay rollout path — optional hosted payment link
  RAZORPAY_KEY_ID:           process.env.RAZORPAY_KEY_ID ?? '',
  RAZORPAY_KEY_SECRET:       process.env.RAZORPAY_KEY_SECRET ?? '',
  RAZORPAY_WEBHOOK_SECRET:   process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  RAZORPAY_PAYMENT_LINK_URL: process.env.RAZORPAY_PAYMENT_LINK_URL ?? '',

  // Cloudflare R2 — optional in dev (falls back to public/uploads/)
  R2_ENDPOINT:          process.env.R2_ENDPOINT          ?? '',
  R2_ACCESS_KEY_ID:     process.env.R2_ACCESS_KEY_ID     ?? '',
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? '',
  R2_BUCKET:            process.env.R2_BUCKET            ?? '',
  R2_PUBLIC_URL:        process.env.R2_PUBLIC_URL        ?? '',

  // Demo mode: true when DB is not configured
  get IS_DEMO(): boolean { return !this.MONGODB_URI; },
  // Stripe mode: true when Stripe key is present
  get STRIPE_ENABLED(): boolean { return !!process.env.STRIPE_SECRET_KEY; },
  // Razorpay hosted-link mode: true when a live payment link is present
  get RAZORPAY_ENABLED(): boolean { return !!process.env.RAZORPAY_PAYMENT_LINK_URL; },
  // Full Razorpay API mode: payment links are created per user and can be auto-activated by webhook
  get RAZORPAY_API_ENABLED(): boolean {
    return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  },
  // Payments are enabled when any configured provider can accept a checkout
  get PAYMENTS_ENABLED(): boolean { return this.RAZORPAY_API_ENABLED || this.RAZORPAY_ENABLED || this.STRIPE_ENABLED; },
  // Hosted Razorpay link takes precedence for fast rollout; Stripe remains as fallback
  get PAYMENT_PROVIDER(): 'razorpay' | 'stripe' | 'none' {
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) return 'razorpay';
    if (process.env.RAZORPAY_PAYMENT_LINK_URL) return 'razorpay';
    if (process.env.STRIPE_SECRET_KEY) return 'stripe';
    return 'none';
  },
  // R2 mode: true when all R2 vars are set
  get R2_ENABLED(): boolean {
    return !!(this.R2_ENDPOINT && this.R2_ACCESS_KEY_ID && this.R2_SECRET_ACCESS_KEY && this.R2_BUCKET);
  },
  get GOOGLE_OAUTH_ENABLED(): boolean {
    return !!this.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  },
  get EMAIL_OTP_ENABLED(): boolean {
    return !!(this.RESEND_API_KEY || this.IS_DEV);
  },
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL ?? process.env.CONTACT_EMAIL ?? 'editor@kyc.news',
} as const;
