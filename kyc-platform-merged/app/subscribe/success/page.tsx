import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Subscription Confirmed — KYC Pro' };

export default function SubscribeSuccessPage() {
  return (
    <main className="container" style={{ paddingTop: 80, paddingBottom: 80, textAlign: 'center' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}>✓</div>
        <h1 className="serif" style={{ fontSize: 'clamp(28px,4vw,40px)', marginBottom: 16 }}>
          Welcome to KYC Pro
        </h1>
        <p style={{ fontSize: 18, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 32 }}>
          Your subscription is active. You now have full access to premium articles,
          price forecasting, AI search, and all analytical reports.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/premium/predictor" className="btn btn-gold">
            Open Price Predictor
          </Link>
          <Link href="/" className="btn">
            Browse Articles
          </Link>
        </div>
        <p style={{ fontSize: 12, color: 'var(--dim)', marginTop: 32 }}>
          A confirmation email has been sent to you by Stripe. To manage or cancel your subscription,
          visit your <Link href="/subscribe" style={{ color: 'var(--gold)' }}>account page</Link>.
        </p>
      </div>
    </main>
  );
}
