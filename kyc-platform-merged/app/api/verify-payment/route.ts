import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/jwt';
import { usersAdapter } from '@/lib/adapters';
import { fetchRazorpayOrder, RAZORPAY_PLAN_AMOUNT, verifyRazorpayPaymentSignature } from '@/lib/payments/razorpay';

const BodySchema = z.object({
  razorpay_payment_id: z.string().trim().min(1),
  razorpay_order_id: z.string().trim().min(1),
  razorpay_signature: z.string().trim().min(1),
  plan: z.enum(['monthly', 'annual']),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Login required to verify payment.' }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Missing or invalid payment fields.' }, { status: 400 });
  }

  const isValid = verifyRazorpayPaymentSignature({
    orderId: body.razorpay_order_id,
    paymentId: body.razorpay_payment_id,
    signature: body.razorpay_signature,
  });

  if (!isValid) {
    return NextResponse.json({ error: 'Payment signature mismatch.' }, { status: 400 });
  }

  try {
    const order = await fetchRazorpayOrder(body.razorpay_order_id);
    const orderPlan = order.notes?.kyc_plan;
    const orderUserId = order.notes?.kyc_user_id;

    if (orderUserId !== session._id) {
      return NextResponse.json({ error: 'Payment does not belong to the current user.' }, { status: 400 });
    }

    if (orderPlan !== body.plan) {
      return NextResponse.json({ error: 'Payment plan mismatch.' }, { status: 400 });
    }

    if (order.amount !== RAZORPAY_PLAN_AMOUNT[body.plan]) {
      return NextResponse.json({ error: 'Payment amount mismatch.' }, { status: 400 });
    }

    await usersAdapter.activatePremium(session._id, body.plan, {
      paymentRef: body.razorpay_payment_id,
      effectiveAt: new Date(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[POST /api/verify-payment]', error);
    return NextResponse.json({ error: 'Payment was verified, but subscription activation failed.' }, { status: 500 });
  }
}
