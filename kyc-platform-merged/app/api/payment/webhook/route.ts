/**
 * POST /api/payment/webhook
 * Stripe webhook endpoint — verifies signature and syncs subscription state.
 *
 * Handled events:
 *   checkout.session.completed       → activate premium
 *   customer.subscription.updated   → sync status/plan/expiry
 *   customer.subscription.deleted   → cancel subscription
 *   invoice.payment_failed           → mark expired
 */
import { NextRequest, NextResponse } from 'next/server';
import { getStripe, mapStripeStatus, mapStripePlan, subscriptionExpiresAt } from '@/lib/payments/stripe';
import { usersAdapter } from '@/lib/adapters';
import { env } from '@/lib/env';
import Stripe from 'stripe';

// Tell Next.js not to parse the body — Stripe needs the raw bytes to verify the signature
export const config = { api: { bodyParser: false } };

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured.' }, { status: 503 });
  }

  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET is not set — cannot verify events.');
    return NextResponse.json({ error: 'Webhook secret not configured.' }, { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing Stripe signature.' }, { status: 400 });
  }

  const rawBody = await req.arrayBuffer();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(Buffer.from(rawBody), sig, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[webhook] Signature verification failed:', msg);
    return NextResponse.json({ error: `Webhook signature invalid: ${msg}` }, { status: 400 });
  }

  try {
    await handleEvent(stripe, event);
  } catch (err) {
    console.error(`[webhook] Handler failed for ${event.type}:`, err);
    // Return 200 so Stripe doesn't retry endlessly — we log and investigate separately
    return NextResponse.json({ received: true, error: 'Handler error — check server logs.' });
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(stripe: Stripe, event: Stripe.Event) {
  switch (event.type) {

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription' || !session.subscription || !session.customer) break;

      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
      const plan = mapStripePlan(sub.items.data[0]?.price.id ?? '');

      await usersAdapter.syncStripeSubscription(customerId, {
        stripeSubscriptionId: sub.id,
        status: mapStripeStatus(sub.status),
        plan,
        expiresAt: subscriptionExpiresAt(sub),
      });
      console.info(`[webhook] checkout.session.completed — customer ${customerId} subscribed to ${plan}`);
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const plan = mapStripePlan(sub.items.data[0]?.price.id ?? '');

      await usersAdapter.syncStripeSubscription(customerId, {
        stripeSubscriptionId: sub.id,
        status: mapStripeStatus(sub.status),
        plan,
        expiresAt: subscriptionExpiresAt(sub),
      });
      console.info(`[webhook] subscription.updated — ${customerId} → ${sub.status}`);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const plan = mapStripePlan(sub.items.data[0]?.price.id ?? '');

      await usersAdapter.syncStripeSubscription(customerId, {
        stripeSubscriptionId: sub.id,
        status: 'cancelled',
        plan,
        expiresAt: subscriptionExpiresAt(sub),
      });
      console.info(`[webhook] subscription.deleted — ${customerId} cancelled`);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceAny = invoice as unknown as { customer?: unknown; subscription?: unknown };
      if (!invoiceAny.customer || !invoiceAny.subscription) break;
      const customerId = typeof invoiceAny.customer === 'string'
        ? invoiceAny.customer
        : (invoiceAny.customer as { id: string }).id;
      const subId = typeof invoiceAny.subscription === 'string'
        ? invoiceAny.subscription
        : (invoiceAny.subscription as { id: string }).id;
      const sub  = await stripe.subscriptions.retrieve(subId);
      const plan = mapStripePlan(sub.items.data[0]?.price.id ?? '');

      await usersAdapter.syncStripeSubscription(customerId, {
        stripeSubscriptionId: sub.id,
        status: 'expired',
        plan,
        expiresAt: subscriptionExpiresAt(sub),
      });
      console.warn(`[webhook] invoice.payment_failed — ${customerId} access revoked`);
      break;
    }

    default:
      // Unhandled event types — silently ignore
      break;
  }
}
