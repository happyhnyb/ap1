'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { EmailOTPCard } from '@/components/auth/EmailOTPCard';

export default function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const name     = fd.get('name') as string;
    const email    = fd.get('email') as string;
    const password = fd.get('password') as string;
    const confirm  = fd.get('confirm') as string;

    if (password !== confirm) { setError('Passwords do not match.'); setLoading(false); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); setLoading(false); return; }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Registration failed.'); return; }
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
          <img src="/logo.png" alt="KYC" width={56} height={56} style={{ margin: '0 auto 14px', display: 'block', borderRadius: '50%', filter: 'brightness(1.2) drop-shadow(0 0 8px rgba(76,175,80,.3))' }} />
          <h1 className="form-title">Create your account</h1>
          <p className="form-sub">Free access to all public content</p>
        </div>

        {error && (
          <div className="notice notice-red" style={{ marginBottom: 18, textAlign: 'center' }}>{error}</div>
        )}

        <form onSubmit={handleSubmit} className="form-grid">
          <div className="form-group">
            <label className="form-label">Full name</label>
            <input className="field" name="name" type="text" placeholder="Dhairya Pareek" required autoComplete="name" />
          </div>
          <div className="form-group">
            <label className="form-label">Email address</label>
            <input className="field" name="email" type="email" placeholder="you@example.com" required autoComplete="email" />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="field" name="password" type="password" placeholder="Min. 8 characters" required autoComplete="new-password" />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm password</label>
            <input className="field" name="confirm" type="password" placeholder="Repeat password" required autoComplete="new-password" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 4, justifyContent: 'center' }}>
            {loading ? 'Creating account…' : 'Create free account'}
          </button>
        </form>

        <div className="divider" style={{ margin: '20px 0' }} />
        <GoogleAuthButton text="signup_with" />

        <div className="divider" style={{ margin: '20px 0' }} />
        <EmailOTPCard intent="register" />

        <div className="divider" style={{ margin: '24px 0' }} />
        <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--muted)', margin: 0 }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--green)', fontWeight: 500 }}>Sign in</Link>
        </p>

        <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 12, color: 'var(--dim)', lineHeight: 1.6 }}>
          After registering, <Link href="/subscribe" style={{ color: 'var(--gold)' }}>upgrade to KYC Pro</Link> to unlock premium articles, AI search, and the mandi predictor.
        </div>
      </div>
    </main>
  );
}
