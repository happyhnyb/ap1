import { NextRequest, NextResponse } from 'next/server';
import { usersAdapter } from '@/lib/adapters';
import { extractRazorpayWebhookContext, type RazorpayWebhookEvent, verifyRazorpayWebhookSignature } from '@/lib/payments/razorpay';
import { env } from '@/lib/env';

export async function POST(req: NextRequest) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    console.error('[razorpay webhook] RAZORPAY_WEBHOOK_SECRET is not set.');
    return NextResponse.json({ error: 'Webhook secret not configured.' }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature');
  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Webhook signature invalid.' }, { status: 400 });
  }

  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const ctx = extractRazorpayWebhookContext(event);

  try {
    switch (ctx.eventType) {
      case 'payment_link.paid':
      case 'payment.captured': {
        if (!ctx.userId || !ctx.plan || !ctx.paymentId) {
          return NextResponse.json({ ok: true, ignored: true, reason: 'Missing KYC metadata.' });
        }

        await usersAdapter.activatePremium(ctx.userId, ctx.plan, {
          paymentRef: ctx.paymentId,
          effectiveAt: new Date(),
        });

        console.info(`[razorpay webhook] activated ${ctx.userId} on ${ctx.plan} via ${ctx.paymentId}`);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ ok: true, ignored: true });
    }
  } catch (err) {
    console.error(`[razorpay webhook] Handler failed for ${ctx.eventType}:`, err);
    return NextResponse.json({ error: 'Webhook handler failed.' }, { status: 500 });
  }
}
