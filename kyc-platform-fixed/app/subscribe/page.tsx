import Link from 'next/link';
import type { Metadata } from 'next';
import { PLANS } from '@/mocks/data';
import { getServerSession } from '@/lib/auth/jwt';
import { isPremium } from '@/lib/auth/entitlement';
import { SubscribeButton } from '@/components/subscribe/SubscribeButton';
export const metadata: Metadata = { title: 'Subscribe' };

const FEATURES_PRO = [
  'Unlimited premium articles & deep dives',
  'AI-powered search with source citations',
  'Real-time mandi price predictor',
  'Commodity forecasting (14-day horizon)',
  'Full analytical reports',
  'Priority market alerts',
];

export default async function SubscribePage() {
  const session = await getServerSession();
  const hasPro = isPremium(session);

  return (
    <main className="container" style={{ paddingBottom: 80 }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '60px 0 40px' }}>
        <span className="badge badge-gold" style={{ marginBottom: 16, display: 'inline-flex' }}>★ KYC Pro</span>
        <h1 className="serif" style={{ fontSize: 'clamp(32px,5vw,52px)', margin: '0 0 14px', lineHeight: 1.05 }}>
          Premium commodity intelligence
        </h1>
        <p style={{ fontSize: 18, color: 'var(--muted)', maxWidth: 540, margin: '0 auto', lineHeight: 1.6 }}>
          Join analysts, traders, and agri-professionals who depend on KYC for real data and deep analysis.
        </p>
      </div>

      {hasPro && (
        <div className="notice notice-green" style={{ maxWidth: 500, margin: '0 auto 32px', textAlign: 'center' }}>
          ✓ You have an active KYC Pro subscription.
        </div>
      )}

      {/* Plans */}
      <div className="plan-grid" style={{ maxWidth: 960, margin: '0 auto' }}>
        {PLANS.map((plan) => (
          <div key={plan.id} className={`card-elevated plan${plan.featured ? ' featured' : ''}`} style={{ position: 'relative', overflow: 'hidden' }}>
            {plan.featured && (
              <div style={{ position: 'absolute', top: 0, right: 0, background: 'var(--gold)', color: '#1a1400', fontSize: 10, fontWeight: 700, padding: '4px 14px', borderRadius: '0 18px 0 10px', letterSpacing: '.06em' }}>
                MOST POPULAR
              </div>
            )}

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                {plan.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                <span className="plan-price">{plan.price}</span>
                <span className="plan-period">{plan.period}</span>
              </div>
              {plan.id === 'annual' && (
                <div style={{ fontSize: 12, color: 'var(--green)', marginBottom: 8 }}>Save 25% vs monthly</div>
              )}
            </div>

            <div className="divider" />

            <ul className="plan-features">
              {(plan.id === 'free' ? plan.features : FEATURES_PRO).map((f) => (
                <li key={f} className="plan-feature">{f}</li>
              ))}
            </ul>

            <div>
              {session && session.plan === plan.id && session.sub_status === 'active' ? (
                <button className="btn" style={{ width: '100%', justifyContent: 'center', opacity: 0.6 }} disabled>
                  ✓ Current plan
                </button>
              ) : plan.id === 'free' ? (
                <Link href="/register" className="btn" style={{ display: 'flex', justifyContent: 'center' }}>
                  {session ? 'Already registered' : 'Get started free'}
                </Link>
              ) : (
                <SubscribeButton planName={plan.name} price={plan.price} period={plan.period} featured={plan.featured} />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* What's included */}
      <div style={{ maxWidth: 760, margin: '60px auto 0', textAlign: 'center' }}>
        <h2 className="serif" style={{ fontSize: 28, marginBottom: 32 }}>Everything in KYC Pro</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, textAlign: 'left' }}>
          {[
            { icon: '📰', label: 'Premium Articles', desc: 'Full-length deep dives and analysis reports' },
            { icon: '⚡', label: 'Price Predictor', desc: 'Real-time mandi forecasting with 14-day horizon' },
            { icon: '✦', label: 'AI Search', desc: 'Ask questions, get cited answers from our content' },
            { icon: '📊', label: 'Market Analytics', desc: 'Price history, trends, and multi-market comparison' },
          ].map((f) => (
            <div key={f.label} className="card" style={{ padding: '18px 20px' }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{f.label}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--dim)', marginTop: 40 }}>
        Payment gateway integration pending. Wire Razorpay or Stripe via <code style={{ background: 'var(--bg3)', padding: '2px 6px', borderRadius: 4 }}>/api/payment</code>.
        Subscription state is managed in MongoDB — no entitlement rewrite needed when payment is added.
      </p>
    </main>
  );
}
