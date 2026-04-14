'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type RefreshState = 'idle' | 'checking' | 'active' | 'pending' | 'error';

export function SuccessState({ provider }: { provider?: string }) {
  const [state, setState] = useState<RefreshState>(provider === 'razorpay' ? 'checking' : 'active');
  const [message, setMessage] = useState(
    provider === 'razorpay'
      ? 'We are confirming your Razorpay payment and upgrading your access.'
      : 'Your subscription is active. You now have full access to premium articles, price forecasting, AI search, and all analytical reports.'
  );

  useEffect(() => {
    if (provider !== 'razorpay') return;

    let attempts = 0;
    const interval = window.setInterval(async () => {
      attempts += 1;
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.user?.role === 'premium' && data?.user?.sub_status === 'active') {
          setState('active');
          setMessage('Payment confirmed. Your KYC Pro access is live now.');
          window.clearInterval(interval);
          return;
        }
      } catch {
        // keep polling briefly; webhook may still be in flight
      }

      if (attempts >= 10) {
        setState('pending');
        setMessage('Payment was completed, but access confirmation is still syncing. It usually finishes within a minute.');
        window.clearInterval(interval);
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [provider]);

  return (
    <>
      <p style={{ fontSize: 18, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 20 }}>
        {message}
      </p>
      {state === 'checking' && (
        <p style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 24 }}>
          Checking payment status...
        </p>
      )}
      {state === 'pending' && (
        <p style={{ fontSize: 13, color: 'var(--gold)', marginBottom: 24 }}>
          If access does not update shortly, reload this page once. The webhook will keep retrying automatically.
        </p>
      )}
      {state === 'error' && (
        <p style={{ fontSize: 13, color: 'var(--red, #d32f2f)', marginBottom: 24 }}>
          We could not verify your access automatically. Please try again in a moment.
        </p>
      )}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/premium/predictor" className="btn btn-gold">
          Open Price Predictor
        </Link>
        <Link href="/" className="btn">
          Browse Articles
        </Link>
      </div>
    </>
  );
}
