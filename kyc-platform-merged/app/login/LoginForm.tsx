'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { EmailOTPCard } from '@/components/auth/EmailOTPCard';

export default function LoginForm({ isDemo = false }: { isDemo?: boolean }) {
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
          <Image src="/logo.png" alt="KYC" width={56} height={56} style={{ margin: '0 auto 14px', display: 'block', borderRadius: '50%', filter: 'brightness(1.2) drop-shadow(0 0 8px rgba(76,175,80,.3))' }} />
          <h1 className="form-title">Welcome back</h1>
          <p className="form-sub">Sign in to your KYC account</p>
        </div>

        {isDemo && (
          <div className="notice notice-gold" style={{ marginBottom: 18 }}>
            <strong>Demo mode</strong> — new registrations reset when the server restarts.
            Use a demo account below, or ask the admin to add <code style={{ fontSize: 11, background: 'rgba(0,0,0,.3)', padding: '1px 5px', borderRadius: 4 }}>MONGODB_URI</code> in Vercel to enable persistent accounts.
          </div>
        )}
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

        <div className="divider" style={{ margin: '20px 0' }} />
        <GoogleAuthButton text="signin_with" />

        <div className="divider" style={{ margin: '20px 0' }} />
        <EmailOTPCard intent="login" />

        <div className="divider" style={{ margin: '24px 0' }} />
        <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--muted)', margin: 0 }}>
          Don't have an account?{' '}
          <Link href="/register" style={{ color: 'var(--green)', fontWeight: 500 }}>Create one free</Link>
        </p>

        {isDemo && (
          <div className="notice" style={{ marginTop: 20, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--muted)' }}>Demo accounts — click to fill</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {[
                { email: 'admin@kyc.news', pass: 'admin123', label: 'Admin', color: 'var(--green)' },
                { email: 'reader@kyc.news', pass: 'reader123', label: 'Reader', color: 'var(--muted)' },
                { email: 'free@kyc.news', pass: 'free123', label: 'Free', color: 'var(--dim)' },
              ].map(({ email, pass, label, color }) => (
                <button
                  key={email}
                  type="button"
                  onClick={() => {
                    const form = document.querySelector('form');
                    if (!form) return;
                    (form.querySelector('[name=email]') as HTMLInputElement).value = email;
                    (form.querySelector('[name=password]') as HTMLInputElement).value = pass;
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '7px 10px', cursor: 'pointer', textAlign: 'left',
                    transition: 'border-color .15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border2)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <span style={{ fontFamily: 'monospace', color: 'var(--muted)', fontSize: 11.5 }}>{email}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color, letterSpacing: '.04em', marginLeft: 8 }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
