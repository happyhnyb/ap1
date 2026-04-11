# Operations Runbook

## First-time Stripe setup

### 1. Create products in Stripe Dashboard

1. Go to [dashboard.stripe.com/products](https://dashboard.stripe.com/products)
2. Create a product: **KYC Pro Monthly**
   - Price: ₹199 / month recurring
   - Copy the price ID (starts with `price_`)
3. Create a product: **KYC Pro Annual**
   - Price: ₹1,799 / year recurring
   - Copy the price ID
4. Add to `.env.local`:
   ```
   STRIPE_PRICE_MONTHLY=price_xxxxxxxxxxxx
   STRIPE_PRICE_ANNUAL=price_xxxxxxxxxxxx
   ```

### 2. Register the webhook endpoint

1. Go to [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. URL: `https://your-domain.com/api/payment/webhook`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Copy the **Signing secret** (starts with `whsec_`)
6. Add to `.env.local`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
   ```

### 3. Configure Stripe Billing Portal

1. Go to [dashboard.stripe.com/settings/billing/portal](https://dashboard.stripe.com/settings/billing/portal)
2. Enable the portal
3. Configure: allow cancel, change plan, view invoices
4. Set return URL: `https://your-domain.com/subscribe`

---

## Deploying to production

### Environment variables required

| Variable | Source | Notes |
|---|---|---|
| `JWT_SECRET` | `openssl rand -base64 32` | Rotate from committed version |
| `MONGODB_URI` | MongoDB Atlas | Connection string |
| `STRIPE_SECRET_KEY` | Stripe Dashboard | Starts with `sk_live_` |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard | Starts with `whsec_` |
| `STRIPE_PRICE_MONTHLY` | Stripe Dashboard | Starts with `price_` |
| `STRIPE_PRICE_ANNUAL` | Stripe Dashboard | Starts with `price_` |
| `NEXT_PUBLIC_BASE_URL` | Your domain | `https://kyc.news` |
| `DATAGOV_API_KEY` | data.gov.in | Rotate from committed version |
| `OPENAI_API_KEY` | OpenAI Dashboard | Rotate from committed version |

### Docker Compose

```bash
cp .env.example .env
# Fill in all required values
docker compose up --build -d
docker compose logs -f app
```

### Verify deployment

```bash
# Health checks
curl https://your-domain.com/api/predictor/status  # should return JSON
curl http://localhost:4000/health                   # mandi service

# Webhook test (from Stripe CLI)
stripe listen --forward-to localhost:3000/api/payment/webhook
stripe trigger checkout.session.completed
```

---

## Monitoring & alerts

### Health checks

| Endpoint | Expected | Meaning |
|---|---|---|
| `GET /health` (mandi, port 4000) | `{"ok": true}` | Mandi service alive |
| `GET /api/predictor/status` | JSON with `lastRefreshAt` | Data freshness |

### Common issues

#### Forecast returning 500
Likely cause: `DATAGOV_API_KEY` missing or expired. Check mandi service logs:
```bash
docker compose logs mandi | grep ERROR
```

#### User still has premium access after cancellation
The JWT token caches role for up to 7 days. The predictor/AI search routes do fresh DB checks, so access is revoked there immediately. The UI nav may still show "Pro" until token refresh (next login). Acceptable for now — see PRODUCTION_READINESS.md item #2.

#### Webhook events not being received
1. Check `STRIPE_WEBHOOK_SECRET` matches the Stripe Dashboard signing secret
2. Verify the endpoint is registered and the correct events are selected
3. Check Stripe Dashboard → Webhooks → your endpoint → Failed deliveries

#### MongoDB connection errors
Check `MONGODB_URI` is correct and the Atlas IP allowlist includes your server IP.

---

## Rotating secrets

```bash
# JWT_SECRET (invalidates all active sessions)
JWT_SECRET=$(openssl rand -base64 32)

# After rotation, users must log in again — this is expected.
# Notify users if possible before rotating in production.
```

---

## Scheduled tasks

These tasks are NOT automatically scheduled but should be set up:

### Expire stale subscriptions
Stripe webhooks handle most cases, but subscriptions can expire without a webhook if the service was down.

Add a cron route or external scheduler that calls:
```
POST /api/cron/expire-subscriptions
Authorization: Bearer $CRON_SECRET
```

Create `app/api/cron/expire-subscriptions/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { usersAdapter } from '@/lib/adapters';
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await usersAdapter.expireStaleSubscriptions();
  return NextResponse.json({ ok: true });
}
```

Run via Vercel Cron Jobs, GitHub Actions schedule, or an external cron.
