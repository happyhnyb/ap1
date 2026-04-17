'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { EmailOTPCard } from '@/components/auth/EmailOTPCard';

export default function RegisterForm({ isDemo = false }: { isDemo?: boolean }) {
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
    if (!/[A-Z]/.test(password)) { setError('Password must contain at least one uppercase letter.'); setLoading(false); return; }
    if (!/[0-9]/.test(password)) { setError('Password must contain at least one number.'); setLoading(false); return; }

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
          <Image src="/logo.png" alt="KYC" width={56} height={56} style={{ margin: '0 auto 14px', display: 'block', borderRadius: '50%', filter: 'brightness(1.2) drop-shadow(0 0 8px rgba(76,175,80,.3))' }} />
          <h1 className="form-title">Create your account</h1>
          <p className="form-sub">Free access to all public content</p>
        </div>

        {isDemo && (
          <div className="notice notice-gold" style={{ marginBottom: 18 }}>
            <strong>Demo mode</strong> — new accounts are stored in memory and reset on server restart.
            To enable persistent accounts, add <code style={{ fontSize: 11, background: 'rgba(0,0,0,.3)', padding: '1px 5px', borderRadius: 4 }}>MONGODB_URI</code> in Vercel environment variables.
          </div>
        )}
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
            <input className="field" name="password" type="password" placeholder="Min. 8 chars, 1 uppercase, 1 number" required autoComplete="new-password" />
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
          Create your account to save reading history, use eligible research tools, and receive product updates as additional access tiers roll out.
        </div>
      </div>
    </main>
  );
}
