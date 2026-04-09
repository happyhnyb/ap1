'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const email    = fd.get('email') as string;
    const password = fd.get('password') as string;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed.'); return; }
      router.push('/');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: 'calc(100vh - 120px)', padding: '40px 16px' }}>
      <div className="card-elevated form-wrap" style={{ width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div className="logo-mark" style={{ margin: '0 auto 14px', width: 48, height: 48, fontSize: 20 }}>K</div>
          <h1 className="form-title">Welcome back</h1>
          <p className="form-sub">Sign in to your KYC account</p>
        </div>

        {error && (
          <div className="notice notice-red" style={{ marginBottom: 18, textAlign: 'center' }}>{error}</div>
        )}

        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-group">
            <label className="form-label">Email address</label>
            <input className="field" name="email" type="email" placeholder="you@example.com" required autoComplete="email" />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="field" name="password" type="password" placeholder="••••••••" required autoComplete="current-password" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 4, justifyContent: 'center' }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="divider" style={{ margin: '24px 0' }} />
        <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--muted)', margin: 0 }}>
          Don't have an account?{' '}
          <Link href="/register" style={{ color: 'var(--green)', fontWeight: 500 }}>Create one free</Link>
        </p>

        <div className="notice" style={{ marginTop: 20, fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--muted)' }}>Demo accounts</div>
          <div style={{ color: 'var(--dim)', lineHeight: 1.8 }}>
            admin@kyc.news / admin123 (Admin)<br />
            reader@kyc.news / reader123 (Pro)<br />
            free@kyc.news / free123 (Free)
          </div>
        </div>
      </div>
    </main>
  );
}
