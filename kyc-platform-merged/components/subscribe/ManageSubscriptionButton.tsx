'use client';

import { useState } from 'react';

export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/payment/portal', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not open billing portal.');
        return;
      }
      if (data.url) window.location.assign(data.url);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        className="btn btn-secondary"
        onClick={handleClick}
        disabled={loading}
        style={{ opacity: loading ? 0.7 : 1 }}
      >
        {loading ? 'Opening…' : 'Manage subscription'}
      </button>
      {error && (
        <p role="alert" style={{ color: 'var(--red, #d32f2f)', fontSize: 13, marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}
