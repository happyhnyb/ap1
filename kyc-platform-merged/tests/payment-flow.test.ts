/**
 * Payment flow tests.
 *
 * These tests validate:
 * 1. Stripe helper functions (mapStripeStatus, mapStripePlan)
 * 2. Subscription state transitions (active → cancelled → expired)
 * 3. isPremiumUser fresh-check logic
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { isPremiumUser } from '../lib/auth/entitlement';
import type { User } from '../types/user';

function makeUser(overrides: Partial<User>): User {
  return {
    _id:           'u1',
    name:          'Test User',
    email:         'test@kyc.news',
    password_hash: 'hashed',
    mobile:        null,
    role:          'reader',
    auth_methods:  ['email'],
    subscription:  { status: 'none', plan: 'free', expires_at: null },
    created_at:    '2026-01-01',
    ...overrides,
  };
}

describe('isPremiumUser — fresh DB-backed check', () => {
  it('returns false for null', () => {
    expect(isPremiumUser(null)).toBe(false);
  });

  it('returns false for free reader', () => {
    expect(isPremiumUser(makeUser({ role: 'reader' }))).toBe(false);
  });

  it('returns true for active premium subscriber', () => {
    const future = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    expect(isPremiumUser(makeUser({
      role: 'premium',
      subscription: { status: 'active', plan: 'monthly', expires_at: future },
    }))).toBe(true);
  });

  it('returns false for expired premium (expires_at in the past)', () => {
    const past = '2020-01-01';
    expect(isPremiumUser(makeUser({
      role: 'premium',
      subscription: { status: 'active', plan: 'monthly', expires_at: past },
    }))).toBe(false);
  });

  it('returns false for cancelled subscription', () => {
    expect(isPremiumUser(makeUser({
      role: 'premium',
      subscription: { status: 'cancelled', plan: 'monthly', expires_at: null },
    }))).toBe(false);
  });

  it('returns false for subscription with status expired', () => {
    expect(isPremiumUser(makeUser({
      role: 'premium',
      subscription: { status: 'expired', plan: 'monthly', expires_at: null },
    }))).toBe(false);
  });

  it('returns true for admin regardless of subscription state', () => {
    expect(isPremiumUser(makeUser({
      role: 'admin',
      subscription: { status: 'none', plan: 'free', expires_at: null },
    }))).toBe(true);
  });

  it('returns true for editor regardless of subscription state', () => {
    expect(isPremiumUser(makeUser({
      role: 'editor',
      subscription: { status: 'none', plan: 'free', expires_at: null },
    }))).toBe(true);
  });

  it('returns false when role is premium but status is none', () => {
    expect(isPremiumUser(makeUser({
      role: 'premium',
      subscription: { status: 'none', plan: 'free', expires_at: null },
    }))).toBe(false);
  });
});

describe('Stripe status mapping', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = '';
    process.env.STRIPE_PRICE_MONTHLY = 'price_monthly_test';
    process.env.STRIPE_PRICE_ANNUAL  = 'price_annual_test';
  });

  it('maps Stripe "active" → our "active"', async () => {
    const { mapStripeStatus } = await import('../lib/payments/stripe');
    expect(mapStripeStatus('active')).toBe('active');
    expect(mapStripeStatus('trialing')).toBe('active');
  });

  it('maps Stripe "canceled" → our "cancelled"', async () => {
    const { mapStripeStatus } = await import('../lib/payments/stripe');
    expect(mapStripeStatus('canceled')).toBe('cancelled');
    expect(mapStripeStatus('incomplete_expired')).toBe('cancelled');
  });

  it('maps Stripe "past_due" → our "expired"', async () => {
    const { mapStripeStatus } = await import('../lib/payments/stripe');
    expect(mapStripeStatus('past_due')).toBe('expired');
    expect(mapStripeStatus('unpaid')).toBe('expired');
    expect(mapStripeStatus('paused')).toBe('expired');
  });

  it('maps unknown status → "none"', async () => {
    const { mapStripeStatus } = await import('../lib/payments/stripe');
    expect(mapStripeStatus('incomplete')).toBe('none');
    expect(mapStripeStatus('mystery')).toBe('none');
  });

  it('maps price ID to plan name', async () => {
    const { mapStripePlan } = await import('../lib/payments/stripe');
    expect(mapStripePlan('price_annual_test')).toBe('annual');
    expect(mapStripePlan('price_monthly_test')).toBe('monthly');
    expect(mapStripePlan('price_unknown')).toBe('monthly'); // fallback
  });
});

describe('Payment provider selection', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = '';
    process.env.RAZORPAY_PAYMENT_LINK_URL = '';
  });

  it('prefers Razorpay when a payment link is configured', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.RAZORPAY_PAYMENT_LINK_URL = 'https://rzp.io/rzp/122b60jt';

    const { getPaymentProvider, getPaymentProviderLabel, getRazorpayPaymentLink } =
      await import('../lib/payments/provider');

    expect(getPaymentProvider()).toBe('razorpay');
    expect(getPaymentProviderLabel()).toBe('Razorpay');
    expect(getRazorpayPaymentLink()).toBe('https://rzp.io/rzp/122b60jt');
  });

  it('falls back to Stripe when Razorpay is not configured', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';

    const { getPaymentProvider, getPaymentProviderLabel, getRazorpayPaymentLink } =
      await import('../lib/payments/provider');

    expect(getPaymentProvider()).toBe('stripe');
    expect(getPaymentProviderLabel()).toBe('Stripe');
    expect(getRazorpayPaymentLink()).toBeNull();
  });
});
