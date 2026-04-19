import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,

  // Only trace a fraction of transactions to stay on free tier
  tracesSampleRate: 0.1,

  // Capture replay only on errors
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0,

  // Don't log Sentry noise to the browser console
  debug: false,

  // Ignore benign browser errors
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection captured',
    /Network request failed/,
    /Failed to fetch/,
    /Load failed/,
  ],
});
