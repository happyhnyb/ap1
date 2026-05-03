import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/jwt';
import { isPremium } from '@/lib/auth/entitlement';
import { env } from '@/lib/env';
import { createRazorpayOrder, RAZORPAY_PLAN_AMOUNT, type RazorpayPlan } from '@/lib/payments/razorpay';

const BodySchema = z.object({
  plan: z.enum(['monthly', 'annual']),
  amount: z.number().int().min(100).optional(),
  currency: z.string().trim().length(3).optional(),
  receipt: z.string().trim().min(1).max(40).optional(),
});

function makeReceipt(userId: string, plan: RazorpayPlan) {
  return `kyc_${plan}_${userId}_${Date.now()}`.slice(0, 40);
}

export async function POST(req: NextRequest) {
  if (!env.RAZORPAY_API_ENABLED) {
    return NextResponse.json({ error: 'Razorpay is not configured.' }, { status: 503 });
  }

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
    return NextResponse.json({ error: 'Invalid order payload.' }, { status: 400 });
  }

  const amount = RAZORPAY_PLAN_AMOUNT[body.plan];
  if (body.amount !== undefined && body.amount !== amount) {
    return NextResponse.json({ error: 'Amount does not match the selected plan.' }, { status: 400 });
  }

  const currency = (body.currency ?? 'INR').toUpperCase();
  const receipt = body.receipt ?? makeReceipt(session._id, body.plan);

  try {
    const order = await createRazorpayOrder({
      amount,
      currency,
      receipt,
      plan: body.plan,
      userId: session._id,
    });

    return NextResponse.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      plan: body.plan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Razorpay error.';
    const status = /\b401\b|\b403\b/.test(message) ? 401 : 500;
    console.error('[POST /api/create-order]', error);
    return NextResponse.json({ error: status === 401 ? 'Razorpay authentication failed.' : 'Could not create Razorpay order.' }, { status });
  }
}
