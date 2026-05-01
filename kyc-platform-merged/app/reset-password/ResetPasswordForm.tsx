'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get('email') || '';
  const token = searchParams.get('token') || '';
  const hasToken = useMemo(() => token.length > 0, [token]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get('email') || '');
    const password = String(formData.get('password') || '');
    const confirm = String(formData.get('confirm') || '');

    if (!hasToken) {
      setError('This reset link is missing its token. Request a new one.');
      setLoading(false);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, password }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Unable to reset password.');
        return;
      }
      setSuccess('Password updated. Redirecting to sign in…');
      setTimeout(() => {
        router.push('/login');
        router.refresh();
      }, 900);
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
          <h1 className="form-title">Reset password</h1>
          <p className="form-sub">Choose a new password for your account.</p>
        </div>

        {error && <div className="notice notice-red" style={{ marginBottom: 18, textAlign: 'center' }}>{error}</div>}
        {success && <div className="notice" style={{ marginBottom: 18, textAlign: 'center' }}>{success}</div>}

        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-group">
            <label className="form-label">Email address</label>
            <input className="field" name="email" type="email" defaultValue={initialEmail} required autoComplete="email" />
          </div>
          <div className="form-group">
            <label className="form-label">New password</label>
            <input className="field" name="password" type="password" placeholder="Min. 8 chars, 1 uppercase, 1 number" required autoComplete="new-password" />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm password</label>
            <input className="field" name="confirm" type="password" placeholder="Repeat password" required autoComplete="new-password" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ justifyContent: 'center' }}>
            {loading ? 'Updating password…' : 'Set new password'}
          </button>
        </form>

        <div className="divider" style={{ margin: '24px 0' }} />
        <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--muted)', margin: 0 }}>
          Need a fresh link? <Link href="/forgot-password" style={{ color: 'var(--green)', fontWeight: 500 }}>Request another reset email</Link>
        </p>
      </div>
    </main>
  );
}
