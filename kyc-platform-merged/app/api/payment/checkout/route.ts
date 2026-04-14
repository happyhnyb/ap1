/**
 * POST /api/payment/checkout
 * Creates a Stripe Checkout session for the requested plan.
 * Requires authentication. Returns { url } for client redirect.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { isPremium } from '@/lib/auth/entitlement';
import { getStripe, mapStripePlan } from '@/lib/payments/stripe';
import { getPaymentProvider, getRazorpayPaymentLink } from '@/lib/payments/provider';
import { createRazorpayPaymentLink } from '@/lib/payments/razorpay';
import { usersAdapter } from '@/lib/adapters';
import { env } from '@/lib/env';
import { z } from 'zod';

const BodySchema = z.object({
  plan: z.enum(['monthly', 'annual']),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Login required to subscribe.' }, { status: 401 });
  }

  if (isPremium(session)) {
    return NextResponse.json({ error: 'You already have an active subscription.' }, { status: 400 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid plan. Use "monthly" or "annual".' }, { status: 400 });
  }

  const provider = getPaymentProvider();

  if (provider === 'razorpay') {
    try {
      const user = await usersAdapter.getByEmail(session.email);
      if (!user) {
        return NextResponse.json({ error: 'User not found.' }, { status: 404 });
      }

      if (env.RAZORPAY_API_ENABLED) {
        const paymentLink = await createRazorpayPaymentLink({
          userId: user._id,
          name: user.name,
          email: user.email,
          mobile: user.mobile,
          plan: body.plan,
        });

        return NextResponse.json({
          url: paymentLink.short_url,
          provider,
          plan: body.plan,
          paymentLinkId: paymentLink.id,
          autoActivation: true,
        });
      }

      const url = getRazorpayPaymentLink();
      if (!url) {
        return NextResponse.json(
          { error: 'Razorpay checkout is not configured. Please contact support.' },
          { status: 503 }
        );
      }

      return NextResponse.json({
        url,
        provider,
        plan: body.plan,
        requiresManualActivation: true,
      });
    } catch (err) {
      console.error('[POST /api/payment/checkout][razorpay]', err);
      return NextResponse.json(
        { error: 'Could not create Razorpay checkout. Please try again.' },
        { status: 500 }
      );
    }
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: 'Payment processing is not configured. Please contact support.' },
      { status: 503 }
    );
  }

  const priceMonthly = env.STRIPE_PRICE_MONTHLY;
  const priceAnnual  = env.STRIPE_PRICE_ANNUAL;
  if (!priceMonthly || !priceAnnual) {
    return NextResponse.json(
      { error: 'Subscription products are not configured. Please contact support.' },
      { status: 503 }
    );
  }

  const priceId = body.plan === 'annual' ? priceAnnual : priceMonthly;

  try {
    // Look up or create Stripe customer
    const user = await usersAdapter.getByEmail(session.email);
    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    let customerId = (user as any).stripe_customer_id as string | null ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.email,
        name:  session.name,
        metadata: { kyc_user_id: session._id },
      });
      customerId = customer.id;
      await usersAdapter.setStripeCustomerId(session._id, customerId);
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${env.BASE_URL}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${env.BASE_URL}/subscribe?cancelled=1`,
      subscription_data: {
        metadata: {
          kyc_user_id: session._id,
          plan: body.plan,
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    });

    return NextResponse.json({ url: checkoutSession.url, provider: 'stripe', plan: body.plan });
  } catch (err) {
    console.error('[POST /api/payment/checkout]', err);
    return NextResponse.json({ error: 'Could not create checkout session. Please try again.' }, { status: 500 });
  }
}
