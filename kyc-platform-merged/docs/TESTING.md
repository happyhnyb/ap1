# Testing Guide

## Test stack

- **Vitest 4.x** — fast, TypeScript-native test runner
- **@vitest/coverage-v8** — code coverage
- Tests live in `tests/` and are `.test.ts` files

## Running tests

```bash
# Run all tests once
npm test

# Watch mode (re-runs on file change)
npm run test:watch

# With coverage report
npm run test:coverage

# Typecheck (no test execution)
npm run typecheck
```

## Test files

| File | What it covers |
|---|---|
| `tests/validation.test.ts` | All Zod schemas: LoginSchema, RegisterSchema, ContactSchema, CreatePostSchema, PatchPostSchema, PredictorFilterSchema, parseQuery helper |
| `tests/entitlement.test.ts` | Permission logic: isPremium, isAdmin, isEditor, canAccessPost, canAccessPredictor, canAccessAISearch, tierLabel |
| `tests/jwt.test.ts` | JWT sign/verify round-trip, tamper detection, cookieOptions |
| `tests/ratelimit.test.ts` | Sliding-window rate limiter: allow within limit, block over limit, namespace isolation, IP extraction |
| `tests/predictor-types.test.ts` | ForecastResult contract validator: direction, bounds, alpha/beta range, disclaimer |
| `tests/forecast-crash.test.ts` | **Regression** for P0 crash: ForecastMeta shape, synthetic fields presence, backtest metric nullability |
| `tests/payment-flow.test.ts` | Stripe status mapping, plan mapping, isPremiumUser with expiry enforcement |

## Test philosophy

These are **unit tests** and **contract tests** — they validate logic and data contracts without hitting external services (no DB, no Stripe, no OpenAI calls).

Integration tests (hitting a real DB, hitting real Stripe test mode) are intentionally not included in the CI suite because they require secrets and external services. They should be run manually in a staging environment.

## What is NOT tested (and why)

| Scenario | Reason not in unit tests |
|---|---|
| Actual Stripe Checkout flow | Requires real Stripe test keys + webhooks |
| Webhook signature verification | Requires real Stripe payload + secret |
| MongoDB queries | Require live connection; adapter pattern makes unit testing straightforward |
| OpenAI responses | External API; mock would not add value |
| Next.js request/response cycle | Use Playwright or Cypress for E2E |

## Adding tests

To add a test for a new feature:

1. Create `tests/<feature>.test.ts`
2. Import the module under test directly (no mocking needed for pure logic)
3. For env-sensitive code (like `lib/env.ts`), set `process.env.X = 'test-value'` **before** dynamic-importing the module:
   ```typescript
   beforeEach(() => { process.env.JWT_SECRET = 'test-secret'; });
   it('...', async () => {
     const { signToken } = await import('../lib/auth/jwt');
     // ...
   });
   ```
4. Run `npm test` — vitest picks up all `tests/**/*.test.ts` automatically

## CI

Tests run automatically in `.github/workflows/ci.yml` on every push to `main` and `dev`, and on every pull request to `main`.

Pipeline: `install → typecheck → lint → test → build`

A failing test blocks merge.
