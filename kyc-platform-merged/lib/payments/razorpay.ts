import crypto from 'crypto';
import { env } from '@/lib/env';

export const RAZORPAY_PLAN_AMOUNT = {
  monthly: 19900,
  annual: 179900,
} as const;

type RazorpayPlan = keyof typeof RAZORPAY_PLAN_AMOUNT;

interface CreatePaymentLinkInput {
  userId: string;
  name: string;
  email: string;
  mobile?: string | null;
  plan: RazorpayPlan;
}

interface RazorpayPaymentLinkResponse {
  id: string;
  short_url: string;
  status: string;
  reference_id?: string | null;
}

export interface RazorpayWebhookEvent {
  event: string;
  payload?: {
    payment_link?: {
      entity?: {
        id?: string;
        status?: string;
        reference_id?: string | null;
        customer?: {
          email?: string | null;
          contact?: string | null;
          name?: string | null;
        };
        notes?: Record<string, string> | null;
      };
    };
    payment?: {
      entity?: {
        id?: string;
        email?: string | null;
        contact?: string | null;
        status?: string | null;
        method?: string | null;
        captured?: boolean;
        notes?: Record<string, string> | null;
      };
    };
  };
}

function getBasicAuthHeader() {
  const token = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  return `Basic ${token}`;
}

export function makeRazorpayReferenceId(userId: string, plan: RazorpayPlan): string {
  return `kyc_${plan}_${userId}_${Date.now()}`;
}

export async function createRazorpayPaymentLink(input: CreatePaymentLinkInput): Promise<RazorpayPaymentLinkResponse> {
  if (!env.RAZORPAY_API_ENABLED) {
    throw new Error('Razorpay API is not configured.');
  }

  const referenceId = makeRazorpayReferenceId(input.userId, input.plan);
  const expireBy = Math.floor(Date.now() / 1000) + 30 * 60;

  const res = await fetch('https://api.razorpay.com/v1/payment_links', {
    method: 'POST',
    headers: {
      Authorization: getBasicAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: RAZORPAY_PLAN_AMOUNT[input.plan],
      currency: 'INR',
      accept_partial: false,
      description: input.plan === 'annual' ? 'KYC Pro Annual subscription' : 'KYC Pro Monthly subscription',
      customer: {
        name: input.name,
        email: input.email,
        contact: input.mobile ?? undefined,
      },
      notify: {
        email: true,
        sms: Boolean(input.mobile),
      },
      reminder_enable: true,
      reference_id: referenceId,
      callback_url: `${env.BASE_URL}/subscribe/success?provider=razorpay`,
      callback_method: 'get',
      expire_by: expireBy,
      notes: {
        kyc_user_id: input.userId,
        kyc_plan: input.plan,
        kyc_email: input.email,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Razorpay payment link creation failed (${res.status}): ${body.slice(0, 240)}`);
  }

  return res.json() as Promise<RazorpayPaymentLinkResponse>;
}

export function verifyRazorpayWebhookSignature(rawBody: string, signature: string | null | undefined): boolean {
  if (!signature || !env.RAZORPAY_WEBHOOK_SECRET) return false;

  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export function extractRazorpayWebhookContext(event: RazorpayWebhookEvent): {
  eventType: string;
  userId: string | null;
  plan: RazorpayPlan | null;
  paymentId: string | null;
  paymentLinkId: string | null;
  paymentStatus: string | null;
  paymentCaptured: boolean;
  customerEmail: string | null;
  customerContact: string | null;
} {
  const paymentLink = event.payload?.payment_link?.entity;
  const payment = event.payload?.payment?.entity;
  const notes = paymentLink?.notes ?? payment?.notes ?? {};

  return {
    eventType: event.event,
    userId: notes?.kyc_user_id ?? null,
    plan: notes?.kyc_plan === 'annual' ? 'annual' : notes?.kyc_plan === 'monthly' ? 'monthly' : null,
    paymentId: payment?.id ?? null,
    paymentLinkId: paymentLink?.id ?? null,
    paymentStatus: payment?.status ?? null,
    paymentCaptured: payment?.captured ?? false,
    customerEmail: payment?.email ?? paymentLink?.customer?.email ?? notes?.kyc_email ?? null,
    customerContact: payment?.contact ?? paymentLink?.customer?.contact ?? null,
  };
}
