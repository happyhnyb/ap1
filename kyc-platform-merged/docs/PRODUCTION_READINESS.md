# Production Readiness Checklist

Last updated: 2026-04-09

## Summary verdict: READY FOR CLOSED BETA

The platform is stable and can accept real paying users, but a handful of items must be addressed before a public launch. See "Remaining blockers" at the bottom.

---

## ✅ Done

### Security
- [x] JWT stored in httpOnly + SameSite=Lax + Secure (production) cookie
- [x] bcryptjs password hashing (rounds=12)
- [x] Account enumeration protection on login/register
- [x] Rate limiting on all write/sensitive endpoints (auth: 5/min, predictor: 30/min, AI search: 10/min, contact: 3/10min)
- [x] Zod input validation on all POST/PATCH routes
- [x] Security headers: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS (prod)
- [x] Secrets removed from tracked files (.env.example has placeholders only)
- [x] Startup env validation (`lib/env.ts` exits on missing required vars in production)
- [x] Production guard in `lib/db/connect.ts` (exits if MONGODB_URI missing in production)

### Payments
- [x] Stripe Checkout integration (`POST /api/payment/checkout`)
- [x] Stripe webhook handler (`POST /api/payment/webhook`)
- [x] Stripe Billing Portal for self-service management (`POST /api/payment/portal`)
- [x] Events handled: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [x] Subscription state synced to MongoDB on every webhook event
- [x] Premium access revoked automatically on cancel/expire/payment failure
- [x] SubscribeButton redirects to real Stripe Checkout (no alert placeholder)
- [x] ManageSubscriptionButton opens Stripe Billing Portal
- [x] Subscribe success page at `/subscribe/success`

### Predictor
- [x] Forecast crash bug fixed (syntheticRatio/hasSyntheticData correctly destructured)
- [x] Rolling backtest metrics added (MAE, RMSE, sMAPE)
- [x] Minimum real-data threshold (default: 7 real data points from non-synthetic snapshots)
- [x] Real vs synthetic data correctly labelled and exposed in API metadata
- [x] Forecast disabled cleanly when real data is insufficient
- [x] Honest meta block on every forecast response (model type, accuracy metrics, disclaimer)
- [x] Premium gating uses fresh DB check (not just JWT token) — catches subscription changes

### Auth & Entitlement
- [x] `isPremiumUser()` — server-side fresh check against DB record
- [x] Subscription expiry enforced in `isPremiumUser()` (checks `expires_at`)
- [x] `expireStaleSubscriptions()` available on usersAdapter for scheduled cleanup
- [x] Dual-adapter pattern: MongoDB in production, in-memory in dev/demo

### Infrastructure
- [x] CI workflow (typecheck → lint → test → build + mandi smoke test)
- [x] Dockerfile + docker-compose for production
- [x] Health check endpoint on mandi service
- [x] .dockerignore

---

## ⚠️ Remaining blockers before public launch

### Must fix

1. **Rate limiting is single-instance only**
   The in-memory `lib/ratelimit.ts` doesn't work in multi-instance deployments (Vercel functions, ECS, etc.). Replace with Redis/Upstash before scaling horizontally.
   Fix: Install `@upstash/ratelimit` + `@upstash/redis`, wrap behind the same `checkRateLimit` interface, add `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` to env.

2. **Stale subscription cleanup is not scheduled**
   `usersAdapter.expireStaleSubscriptions()` exists but nothing calls it automatically. Users whose subscriptions expire won't lose access until their token is refreshed (up to 7 days later).
   Fix: Call it on app startup and every hour, or create a Next.js cron route (`/api/cron/expire-subscriptions`) protected by a `CRON_SECRET`.

3. **Stripe webhook must be registered in Stripe Dashboard**
   The endpoint `POST /api/payment/webhook` is implemented and verified, but you must register it in the Stripe Dashboard with the correct events selected. See RUNBOOK.md.

4. **No Stripe Products/Prices created yet**
   `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_ANNUAL` are empty. You must create products in the Stripe Dashboard and paste the price IDs.

5. **In-memory demo mode must not be reachable in production**
   Currently the production guard logs an error and lets the process continue. It should `process.exit(1)`. The guard in `lib/db/connect.ts` already does this; the one in `lib/adapters/users.ts` only logs. Consider tightening.

### Should fix before public launch

6. **No email notifications**
   `RESEND_API_KEY` / `CONTACT_EMAIL` are in .env.example but nothing sends email. Users get no receipt, no password reset, no notification of access change.

7. **Password reset not implemented**
   There is no forgot-password flow. Users who lose their password cannot recover their account.

8. **No CSRF protection on form endpoints**
   The SameSite=Lax cookie provides partial CSRF mitigation, but there is no explicit CSRF token on POST endpoints. For highest security, add `csurf` or a double-submit cookie pattern.

9. **File upload not implemented**
   Hero images and inline images are referenced in the Post model but there is no upload endpoint. Posts cannot have images until this is wired to Cloudflare R2 or similar.

10. **AI search has no cost controls**
    OpenAI calls in `/api/ai-search` are rate-limited (10/min) but there is no daily spend cap. A burst of requests could generate unexpected API costs.

---

## Secrets that must be rotated manually

The following secrets were previously committed to the repository in `.env` and `.env.local`. They are now removed from tracked files, but they should be considered compromised:

- `JWT_SECRET` — All existing sessions will be invalidated when rotated
- `OPENAI_API_KEY` — Check usage dashboard for unauthorized usage
- `DATAGOV_API_KEY` — Rotate at data.gov.in

Generate new values:
```bash
# New JWT_SECRET
openssl rand -base64 32

# New DATAGOV_API_KEY — re-register at https://data.gov.in/user/register
```
