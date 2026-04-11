/**
 * Stripe client singleton.
 * Import `stripe` from here — never construct Stripe directly in route files.
 * Returns null when STRIPE_SECRET_KEY is not set (graceful degradation).
 */
import Stripe from 'stripe';
import { env } from '@/lib/env';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  if (!_stripe) {
    _stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-03-25.dahlia',
      typescript: true,
    });
  }
  return _stripe;
}

/**
 * Map a Stripe subscription status to our internal SubStatus.
 * Stripe statuses: active, past_due, canceled, incomplete, incomplete_expired, trialing, paused, unpaid
 */
export function mapStripeStatus(
  stripeStatus: string
): 'active' | 'expired' | 'cancelled' | 'none' {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'canceled':
    case 'incomplete_expired':
      return 'cancelled';
    case 'past_due':
    case 'unpaid':
    case 'paused':
      return 'expired';
    default:
      return 'none';
  }
}

/**
 * Map a Stripe price ID to our internal plan name.
 */
export function mapStripePlan(priceId: string): 'monthly' | 'annual' {
  if (priceId === env.STRIPE_PRICE_ANNUAL) return 'annual';
  return 'monthly';
}

/**
 * Get the period_end of a Stripe subscription as a JS Date.
 * The field is `current_period_end` in older API versions and
 * `billing_cycle_anchor_config` / nested in newer ones.
 * We use a type-safe fallback across versions.
 */
export function subscriptionExpiresAt(sub: Stripe.Subscription): Date | null {
  // `current_period_end` exists as a top-level number in all current Stripe API versions.
  const end = (sub as unknown as { current_period_end?: number }).current_period_end;
  if (!end) return null;
  return new Date(end * 1000);
}
