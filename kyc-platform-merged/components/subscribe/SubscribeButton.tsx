'use client';

import { useState } from 'react';

interface Props {
  planName: string;
  price: string;
  period: string;
  featured: boolean;
  plan: 'monthly' | 'annual';
}

export function SubscribeButton({ planName, price, period, featured, plan }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/payment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }
      if (data.url) {
        window.location.assign(data.url);
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        className={`btn ${featured ? 'btn-gold' : 'btn-primary'}`}
        style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.7 : 1 }}
        onClick={handleClick}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? 'Redirecting…' : `Subscribe ${price}${period}`}
      </button>
      {error && (
        <p role="alert" style={{ color: 'var(--red, #d32f2f)', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
          {error}
        </p>
      )}
    </div>
  );
}
