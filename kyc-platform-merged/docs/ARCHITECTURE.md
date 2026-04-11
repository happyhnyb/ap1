# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────┐
│                  Browser / Client                    │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────┐
│            Next.js 15 App (Port 3000)               │
│                                                      │
│  App Router pages  ──►  Server Components           │
│  API Routes        ──►  Route Handlers              │
│  lib/auth/         ──►  JWT + Entitlement           │
│  lib/adapters/     ──►  Dual-adapter (Mongo/Memory) │
│  lib/payments/     ──►  Stripe integration          │
│  lib/predictor/    ──►  Proxy client to mandi svc   │
└──────┬──────────────────────┬───────────────────────┘
       │ mongodb://            │ HTTP
┌──────▼──────────┐   ┌───────▼───────────────────────┐
│   MongoDB Atlas  │   │  Mandi Service (Port 4000)    │
│                  │   │  Express.js                   │
│  users           │   │  /api/forecast                │
│  posts           │   │  /api/history                 │
│  contacts        │   │  /api/summary                 │
│  usage_logs      │   │  /api/options                 │
└──────────────────┘   │  /api/table                   │
                       │  /api/status                  │
                       └───────┬───────────────────────┘
                               │ HTTPS
                       ┌───────▼───────────────────────┐
                       │  data.gov.in Agmarknet API    │
                       │  (daily snapshot fetch)       │
                       └───────────────────────────────┘
```

## Component Responsibilities

### Next.js App (`/`)

The main application. Handles all user-facing pages, authentication, and API routes.

**Key directories:**
- `app/` — App Router pages and API route handlers
- `lib/adapters/` — Data layer with dual Mongo/in-memory implementation
- `lib/auth/` — JWT token management and entitlement checks
- `lib/payments/` — Stripe client and helpers
- `lib/predictor/` — Typed HTTP proxy client to the mandi service
- `lib/validation.ts` — Zod schemas for all write endpoints
- `lib/ratelimit.ts` — Sliding-window rate limiter (in-memory, see limitations)
- `lib/env.ts` — Startup environment validation

### Mandi Service (`mandi-service/`)

A standalone Express.js microservice responsible for:
- Fetching daily price snapshots from the Agmarknet API (`data.gov.in`)
- Storing snapshots as JSON files in `data/snapshots/YYYY-MM-DD.json`
- Running Holt's Double Exponential Smoothing forecasts on demand
- Generating OpenAI price insights when configured
- Returning aggregate statistics, historical series, and paginated raw records

The mandi service is intentionally lightweight and stateless (except for snapshot files). It runs as a sidecar to the Next.js app in production.

**Forecast model:**
Adaptive Holt's Double Exponential Smoothing. Not ML. Grid-searches 20 α×β combinations using walk-forward cross-validation on available history. Requires ≥7 data points; prefers ≥14. Refuses to forecast when real (non-synthetic) data is below the configured threshold (default: 7).

### MongoDB

User records, posts, contact submissions, and usage logs. Optional — app runs in demo/in-memory mode without it.

**Collections:**
- `users` — Includes Stripe customer/subscription fields
- `posts` — Full-text indexed on title/excerpt/body/tags
- `contacts` — Contact form submissions
- `usage_logs` — AI search audit trail

### Stripe

Payment processing for KYC Pro subscriptions. The Next.js app communicates with Stripe via:
- `POST /api/payment/checkout` — Creates a Checkout Session
- `POST /api/payment/webhook` — Receives subscription lifecycle events
- `POST /api/payment/portal` — Opens Stripe Billing Portal

Webhook events update the `users.subscription` field in MongoDB directly. The JWT token is eventually consistent — it may lag up to 7 days behind subscription changes. High-stakes access checks (predictor, AI search) re-validate against the database on every request.

---

## Authentication Flow

```
User logs in
  → POST /api/auth/login
  → bcrypt.compare(password, hash)
  → signToken(SessionPayload) [jose HS256, 7d]
  → Set-Cookie: kyc_token=<jwt>; httpOnly; SameSite=Lax; Secure (prod)

User accesses premium route
  → getServerSession() — reads + verifies JWT cookie
  → usersAdapter.getByEmail() — live DB lookup
  → isPremiumUser(user) — checks role, status, expires_at
  → 403 if any check fails
```

## Dual-Adapter Pattern

Every data access goes through an adapter (`lib/adapters/`). At startup, the adapter is selected based on `MONGODB_URI`:

```typescript
export const usersAdapter = isMongoConfigured() ? mongo : memory;
```

This means:
- **Dev without MongoDB**: Uses seeded in-memory data from `mocks/data.ts`
- **Production**: Uses MongoDB exclusively. App exits if `MONGODB_URI` is missing.

The interface is identical — no code changes needed to switch.

## Rate Limiting

Current implementation: in-memory sliding-window (`lib/ratelimit.ts`).

**Limitation:** Does not work across multiple instances. In a multi-replica deployment (Vercel functions, ECS, Kubernetes), each instance has its own counter. A user could bypass limits by hitting different instances.

**Production fix:** Replace with `@upstash/ratelimit`. The interface is identical — swap the implementation behind `checkRateLimit()`.

```typescript
// Current (single-instance)
export function checkRateLimit(key, namespace, opts): RateLimitResult

// Drop-in replacement with Redis
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
```

## Data Quality Guarantees

The forecast service makes the following guarantees:

| Property | Guarantee |
|----------|-----------|
| `meta.model_type` | Always `holt_double_exponential_smoothing` |
| `meta.synthetic_ratio` | Always 0–1; reflects ratio of synthetic snapshots |
| `meta.real_data_points` | Count of real (non-backfilled) distinct arrival dates |
| `meta.disclaimer` | Always present and non-empty |
| Minimum data | Refuses forecast if `real_data_points < MIN_REAL_DATA_POINTS` (default 7) |
| Backtest metrics | `mae`/`rmse`/`smape` are null when < 14 data points |
