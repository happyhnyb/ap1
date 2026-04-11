# Know Your Commodity (KYC)

A commodity price intelligence platform built with Next.js 15. It aggregates real mandi (wholesale market) prices from the Indian government's Agmarknet dataset, forecasts short-term price trends, and presents them alongside editorial content.

---

## Architecture

```
kyc-platform-merged/
├── app/                  Next.js 15 App Router — pages and API routes
│   ├── api/              Server-side API handlers (auth, posts, predictor, search)
│   └── (pages)/          Route groups for all UI pages
├── components/           Shared React components
├── lib/
│   ├── adapters/         Dual-adapter pattern: MongoDB in prod, in-memory in dev
│   ├── auth/             JWT helpers (sign/verify/cookie), entitlement checks
│   ├── db/               Mongoose connect + models
│   ├── predictor/        Type contract + proxy client for the mandi sidecar
│   ├── env.ts            Startup environment validation
│   ├── ratelimit.ts      In-memory sliding-window rate limiter
│   └── validation.ts     Zod schemas for all write/sensitive endpoints
├── mandi-service/        Express sidecar — fetches price data, runs forecasts
│   └── src/server.js     Single-file service with scheduler, forecast, insights
├── mocks/                Seed data for development without a database
├── tests/                Vitest unit tests
└── docker-compose.yml    Production compose (app + mandi sidecar)
```

### Dual-adapter pattern

When `MONGODB_URI` is not set the app runs in **demo mode**: all data is served from static in-memory seeds (`mocks/data.ts`). Set `MONGODB_URI` to switch to live MongoDB. No code changes needed.

### Mandi sidecar

The price forecasting logic lives in a separate Express process (`mandi-service/`) that the Next.js app proxies via `lib/predictor/client.ts`. This keeps the heavy data pipeline out of the serverless function budget and makes it independently deployable.

**Forecast model:** Adaptive Holt's Double Exponential Smoothing (level + trend). This is a statistical method, not machine learning. It performs a grid search over 20 α×β combinations using walk-forward cross-validation. Forecasts are short-term indicative estimates only — not financial advice.

---

## Quick start

### Prerequisites

- Node.js 20+
- (Optional) MongoDB — app runs in demo mode without it

### 1. Install dependencies

```bash
npm install
npm run mandi:install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in your values:

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | **Yes (prod)** | Random 32-char string. Dev uses a fallback. |
| `MONGODB_URI` | No | MongoDB connection string. Omit for demo mode. |
| `DATAGOV_API_KEY` | Mandi only | data.gov.in API key for Agmarknet price data. |
| `OPENAI_API_KEY` | No | Enables AI price insights and AI search. |
| `MANDI_SERVICE_URL` | No | Defaults to `http://localhost:4000`. |

### 3. Run locally

In two terminals:

```bash
# Terminal 1 — mandi price sidecar
npm run mandi:dev

# Terminal 2 — Next.js app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo credentials

| Email | Password | Role |
|---|---|---|
| admin@kyc.news | admin123 | Admin |
| editor@kyc.news | editor123 | Editor |
| pro@kyc.news | pro123 | Premium (active) |
| reader@kyc.news | reader123 | Free reader |

> These credentials only work in demo mode (no `MONGODB_URI`). In production, seed your own users.

---

## Development

```bash
npm test              # run unit tests (vitest)
npm run test:watch    # watch mode
npm run test:coverage # coverage report
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run build         # production build
```

---

## Production deployment

### Docker Compose (recommended)

```bash
cp .env.example .env
# Edit .env with real secrets

docker compose up --build -d
```

The compose file starts:
- `mandi` — price sidecar on port 4000, with snapshot data persisted in a named volume
- `app` — Next.js on port 3000, depends on mandi being healthy

### Manual deployment

1. Build the app: `npm run build`
2. The output is in `.next/standalone/` (standalone mode enabled)
3. Start the mandi service: `npm run mandi:start`
4. Start Next.js: `node .next/standalone/server.js`

### Environment checklist before going live

- [ ] `JWT_SECRET` is a random 32+ character string (not the dev fallback)
- [ ] `MONGODB_URI` is set and the database is accessible
- [ ] `DATAGOV_API_KEY` is set for live price data
- [ ] `NODE_ENV=production` is set
- [ ] The committed `.env` and `.env.local` files do **not** contain real secrets (check with `git diff HEAD .env`)

---

## Security

- JWT tokens stored in `httpOnly; SameSite=Lax; Secure (prod)` cookies
- Rate limiting on all write/sensitive endpoints (auth: 5/min, predictor: 30/min, AI search: 10/min)
- Zod validation on all POST/PATCH request bodies
- Security headers: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS (production)
- No account enumeration on login/register

---

## Predictor caveats

The price forecast is produced by a statistical trend-extrapolation model. Key limitations:

- **Not ML.** Holt's Double Exponential Smoothing extrapolates a level and trend component — it does not learn from market signals, weather, or news.
- **Short horizon only.** Accuracy degrades rapidly beyond 7–14 days.
- **Synthetic data.** When real price records are sparse the service backfills using a random walk. The `synthetic_ratio` field in every forecast response tells you how much of the input was synthetic.
- **MAPE is in-sample.** The reported Mean Absolute Percentage Error is computed on the training data, not a held-out test set. Use it as a rough indicator only.
- **Not financial advice.** Do not make purchasing or selling decisions based solely on these forecasts.

The forecast response always includes a `meta.disclaimer` field. Never suppress it in the UI.
