'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function EmailOTPCard({
  intent,
  defaultName = '',
  title,
  description,
}: {
  intent: 'login' | 'register';
  defaultName?: string;
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState(defaultName);
  const [code, setCode] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [devCode, setDevCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function requestCode() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, intent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send verification code.');
      setChallengeToken(data.challenge_token);
      setDevCode(data.dev_preview_code || '');
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send verification code.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, challenge_token: challengeToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid verification code.');
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid verification code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontFamily: 'Lora,serif', fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
        {title ?? (intent === 'login' ? 'Sign in with email code' : 'Create account with email code')}
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        {description ?? (intent === 'login'
          ? 'We’ll email you a 6-digit sign-in code.'
          : 'We’ll email you a 6-digit code and create your account after verification.')}
      </p>

      <div style={{ display: 'grid', gap: 10 }}>
        {intent === 'register' && (
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            autoComplete="name"
          />
        )}
        <input
          className="field"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          type="email"
          autoComplete="email"
        />

        {!sent ? (
          <button
            type="button"
            className="btn"
            disabled={loading || !email || (intent === 'register' && name.trim().length < 2)}
            onClick={requestCode}
            style={{ justifyContent: 'center' }}
          >
            {loading ? 'Sending code…' : 'Send code'}
          </button>
        ) : (
          <>
            <input
              className="field"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              inputMode="numeric"
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={loading || code.length !== 6}
              onClick={verifyCode}
              style={{ justifyContent: 'center' }}
            >
              {loading ? 'Verifying…' : 'Verify and continue'}
            </button>
            <button type="button" className="btn btn-sm" onClick={requestCode} disabled={loading} style={{ justifyContent: 'center' }}>
              Resend code
            </button>
          </>
        )}
      </div>

      {devCode && (
        <div className="notice notice-gold" style={{ marginTop: 12, marginBottom: 0 }}>
          Dev preview code: <strong>{devCode}</strong>
        </div>
      )}

      {error && (
        <div className="notice notice-red" style={{ marginTop: 12, marginBottom: 0 }}>
          {error}
        </div>
      )}
    </div>
  );
}
