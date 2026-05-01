'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resetUrl, setResetUrl] = useState('');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    setResetUrl('');

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json() as { error?: string; message?: string; reset_url?: string };
      if (!res.ok) {
        setError(data.error || 'Unable to send reset email.');
        return;
      }
      setMessage(data.message || 'If that email exists, we have sent a password reset link.');
      setResetUrl(data.reset_url || '');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: 'calc(100vh - 120px)', padding: '40px 16px' }}>
      <div className="card-elevated form-wrap" style={{ width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h1 className="form-title">Forgot password</h1>
          <p className="form-sub">Enter your account email and we’ll send you a reset link.</p>
        </div>

        {error && <div className="notice notice-red" style={{ marginBottom: 18, textAlign: 'center' }}>{error}</div>}
        {message && <div className="notice" style={{ marginBottom: 18, textAlign: 'center' }}>{message}</div>}
        {resetUrl && (
          <div className="notice notice-gold" style={{ marginBottom: 18 }}>
            Email delivery is not configured in this environment yet.
            <div style={{ marginTop: 8, wordBreak: 'break-all' }}>
              <a href={resetUrl} style={{ color: 'var(--green)', fontWeight: 600 }}>{resetUrl}</a>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-group">
            <label className="form-label">Email address</label>
            <input className="field" name="email" type="email" placeholder="you@example.com" required autoComplete="email" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ justifyContent: 'center' }}>
            {loading ? 'Sending link…' : 'Send reset link'}
          </button>
        </form>

        <div className="divider" style={{ margin: '24px 0' }} />
        <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--muted)', margin: 0 }}>
          Remembered it? <Link href="/login" style={{ color: 'var(--green)', fontWeight: 500 }}>Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
