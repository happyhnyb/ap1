/**
 * POST /api/payment/portal
 * Creates a Stripe Billing Portal session so users can manage/cancel their subscription.
 * Requires authentication with an active subscription.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { getStripe } from '@/lib/payments/stripe';
import { usersAdapter } from '@/lib/adapters';
import { env } from '@/lib/env';

export async function POST() {
  if (!env.PAYMENTS_ENABLED) {
    return NextResponse.json(
      { error: 'Billing management is not available because online billing is not active yet.' },
      { status: 503 }
    );
  }

  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Payment portal is not available.' }, { status: 503 });
  }

  const user = await usersAdapter.getByEmail(session.email);
  const customerId = (user as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;
  if (!customerId) {
    return NextResponse.json({ error: 'No billing account found for this user.' }, { status: 404 });
  }

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${env.BASE_URL}/subscribe`,
    });
    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    console.error('[POST /api/payment/portal]', err);
    return NextResponse.json({ error: 'Could not open billing portal.' }, { status: 500 });
  }
}
