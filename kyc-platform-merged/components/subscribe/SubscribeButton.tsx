'use client';

import { useState } from 'react';

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

type PaymentProvider = 'razorpay' | 'stripe' | 'none';

interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpaySuccessResponse) => void | Promise<void>;
  modal?: {
    ondismiss?: () => void;
  };
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
  };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void) => void;
}

interface Props {
  planName: string;
  price: string;
  period: string;
  featured: boolean;
  plan: 'monthly' | 'annual';
  provider: PaymentProvider;
  providerLabel: string;
  amountPaise: number;
  razorpayKeyId?: string;
}

let checkoutLoader: Promise<void> | null = null;

function ensureRazorpayScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window is not available.'));
  if (window.Razorpay) return Promise.resolve();
  if (checkoutLoader) return checkoutLoader;

  checkoutLoader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay Checkout.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay Checkout.'));
    document.body.appendChild(script);
  });

  return checkoutLoader;
}

export function SubscribeButton({ planName, price, period, featured, plan, provider, providerLabel, amountPaise, razorpayKeyId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function launchRazorpayCheckout() {
    if (!razorpayKeyId) {
      setError('Razorpay public key is missing. Please contact support.');
      return;
    }

    await ensureRazorpayScript();

    const orderRes = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan,
        amount: amountPaise,
        currency: 'INR',
        receipt: `kyc_${plan}_${Date.now()}`,
      }),
    });

    const orderData = await orderRes.json().catch(() => ({}));
    if (!orderRes.ok) {
      throw new Error(orderData.error ?? 'Could not create Razorpay order.');
    }

    if (!window.Razorpay) {
      throw new Error('Razorpay Checkout did not load.');
    }

    const checkout = new window.Razorpay({
      key: razorpayKeyId,
      amount: orderData.amount,
      currency: orderData.currency,
      name: 'Know Your Commodity',
      description: `${planName} subscription`,
      order_id: orderData.order_id,
      handler: async (response) => {
        try {
          const verifyRes = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...response,
              plan,
            }),
          });

          const verifyData = await verifyRes.json().catch(() => ({}));
          if (!verifyRes.ok) {
            throw new Error(verifyData.error ?? 'Payment verification failed.');
          }

          window.location.assign('/subscribe/success?provider=razorpay');
        } catch (verifyError) {
          setLoading(false);
          setError(verifyError instanceof Error ? verifyError.message : 'Payment verification failed.');
        }
      },
      modal: {
        ondismiss: () => {
          setLoading(false);
          setError('Checkout was cancelled before payment completed.');
        },
      },
      notes: {
        plan,
      },
      theme: {
        color: '#b78227',
      },
    });

    checkout.on('payment.failed', (response) => {
      setLoading(false);
      setError(response.error?.description ?? 'Payment failed. Please try again.');
    });

    checkout.open();
  }

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      if (provider === 'razorpay') {
        await launchRazorpayCheckout();
        return;
      }

      const res = await fetch('/api/payment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      setError('Checkout link missing. Please try again.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Network error. Please check your connection and try again.');
    } finally {
      if (provider !== 'razorpay') {
        setLoading(false);
      }
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <button
        className={`btn ${featured ? 'btn-gold' : 'btn-primary'}`}
        style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.7 : 1, minHeight: 48 }}
        onClick={handleClick}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? 'Processing…' : `Pay ${price}${period}`}
      </button>
      <p style={{ color: 'var(--dim)', fontSize: 12, textAlign: 'center', lineHeight: 1.4 }}>
        {planName} via {providerLabel}
      </p>
      {error && (
        <p role="alert" style={{ color: 'var(--red, #d32f2f)', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
          {error}
        </p>
      )}
    </div>
  );
}
