'use client';

import { useState } from 'react';

export default function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [ref, setRef] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('loading');
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:    fd.get('name'),
          email:   fd.get('email'),
          subject: fd.get('subject'),
          message: fd.get('message'),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus('error'); setErrorMsg(data.error || 'Submission failed.'); return; }
      setRef(data.ref);
      setStatus('success');
    } catch {
      setStatus('error'); setErrorMsg('Network error. Please try again.');
    }
  }

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: 'calc(100vh - 120px)', padding: '40px 16px' }}>
      <div className="card-elevated form-wrap" style={{ width: '100%' }}>
        {status === 'success' ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
            <h2 className="serif" style={{ fontSize: 24, margin: '0 0 8px' }}>Message received</h2>
            <p style={{ color: 'var(--muted)', margin: '0 0 16px' }}>
              We'll get back to you soon. Your reference number:
            </p>
            <code style={{ background: 'var(--bg3)', padding: '6px 14px', borderRadius: 8, fontSize: 14, color: 'var(--green)' }}>
              {ref}
            </code>
          </div>
        ) : (
          <>
            <h1 className="form-title">Get in touch</h1>
            <p className="form-sub">Story tips, corrections, partnerships, or just to say hello.</p>

            {status === 'error' && (
              <div className="notice notice-red" style={{ marginBottom: 18 }}>{errorMsg}</div>
            )}

            <form onSubmit={handleSubmit} className="form-grid">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input className="field" name="name" placeholder="Your name" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="field" name="email" type="email" placeholder="you@example.com" required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Subject</label>
                <input className="field" name="subject" placeholder="What's this about?" required />
              </div>
              <div className="form-group">
                <label className="form-label">Message</label>
                <textarea className="textarea" name="message" rows={6} placeholder="Your message…" required minLength={20} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={status === 'loading'} style={{ justifyContent: 'center' }}>
                {status === 'loading' ? 'Sending…' : 'Send message'}
              </button>
            </form>

            <p style={{ marginTop: 20, fontSize: 13, color: 'var(--dim)', textAlign: 'center' }}>
              editor@kyc.news · Submissions stored in MongoDB
            </p>
          </>
        )}
      </div>
    </main>
  );
}
