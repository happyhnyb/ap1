import { env } from '@/lib/env';

export type PaymentProvider = 'razorpay' | 'stripe' | 'none';

export function getPaymentProvider(): PaymentProvider {
  return env.PAYMENT_PROVIDER;
}

export function getPaymentProviderLabel(provider: PaymentProvider = getPaymentProvider()): string {
  switch (provider) {
    case 'razorpay':
      return 'Razorpay';
    case 'stripe':
      return 'Stripe';
    default:
      return 'Payments';
  }
}

export function getRazorpayPaymentLink(): string | null {
  return process.env.RAZORPAY_PAYMENT_LINK_URL || null;
}
