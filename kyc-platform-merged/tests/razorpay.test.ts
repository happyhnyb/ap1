import { beforeEach, describe, expect, it } from 'vitest';

describe('Razorpay helpers', () => {
  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'test_secret';
  });

  it('verifies a valid webhook signature', async () => {
    const crypto = await import('crypto');
    const { verifyRazorpayWebhookSignature } = await import('../lib/payments/razorpay');
    const body = JSON.stringify({ event: 'payment_link.paid', payload: {} });
    const signature = crypto.createHmac('sha256', 'test_secret').update(body).digest('hex');

    expect(verifyRazorpayWebhookSignature(body, signature)).toBe(true);
  });

  it('rejects an invalid webhook signature', async () => {
    const { verifyRazorpayWebhookSignature } = await import('../lib/payments/razorpay');
    expect(verifyRazorpayWebhookSignature('{"ok":true}', 'bad-signature')).toBe(false);
  });

  it('extracts KYC metadata from webhook payload', async () => {
    const { extractRazorpayWebhookContext } = await import('../lib/payments/razorpay');
    const ctx = extractRazorpayWebhookContext({
      event: 'payment_link.paid',
      payload: {
        payment_link: {
          entity: {
            id: 'plink_123',
            notes: { kyc_user_id: 'u123', kyc_plan: 'annual', kyc_email: 'paid@kyc.news' },
            customer: { email: 'customer@kyc.news', contact: '9999999999' },
          },
        },
        payment: {
          entity: {
            id: 'pay_123',
            status: 'captured',
            captured: true,
            contact: '9999999999',
          },
        },
      },
    });

    expect(ctx.userId).toBe('u123');
    expect(ctx.plan).toBe('annual');
    expect(ctx.paymentId).toBe('pay_123');
    expect(ctx.paymentCaptured).toBe(true);
    expect(ctx.customerEmail).toBe('customer@kyc.news');
  });
});
