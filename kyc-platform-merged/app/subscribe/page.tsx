import Link from 'next/link';
import type { Metadata } from 'next';
import { PLANS } from '@/mocks/data';
import { getEffectiveServerSession } from '@/lib/auth/current-user';
import { isPremium } from '@/lib/auth/entitlement';
import { SubscribeButton } from '@/components/subscribe/SubscribeButton';
import { ManageSubscriptionButton } from '@/components/subscribe/ManageSubscriptionButton';
import { env } from '@/lib/env';
import { getPaymentProviderLabel } from '@/lib/payments/provider';

export const metadata: Metadata = { title: 'Subscribe — KYC Pro' };

const PRO_FEATURES = [
  { label: 'Unlimited premium articles & deep dives',     sub: 'Full analytical library, no monthly cap'               },
  { label: 'Price Predictor with 14-day horizon',         sub: 'GBRT + Holt-Winters ensemble, confidence bands'        },
  { label: 'AI-powered search with source citations',     sub: 'Semantic search across all KYC content'                },
  { label: 'Commodity forecasting for 24 crops',          sub: 'Rolling-origin cross-validated champion models'        },
  { label: 'Backtest metrics & model quality reports',    sub: 'sMAPE, WAPE, directional accuracy per selection'       },
  { label: 'Priority market alerts',                      sub: 'Anomaly detection on prices, arrivals, volatility'     },
];

const FREE_FEATURES = [
  '3 premium articles/month',
  'All breaking news & alerts',
  'Market prices overview',
  'Weekly newsletter',
];

const INCLUDED = [
  { icon: '⚡', title: 'Price Predictor',   desc: 'GBRT forecasting with 14-day horizon and confidence bands' },
  { icon: '✦',  title: 'AI Search',         desc: 'Ask questions, get cited answers from the full library'    },
  { icon: '📊', title: 'Market Analytics',  desc: 'Backtest metrics, quality reports, model explanations'      },
  { icon: '📰', title: 'Full Library',      desc: 'Every premium article, deep dive, and annual report'        },
];

const PERSONAS = [
  { role: 'Commodity Traders',     quote: 'The 14-day GBRT forecast saved me from a bad cotton call last season.' },
  { role: 'Agri Analysts',         quote: 'Backtest accuracy metrics are something I\'d only expect from Bloomberg.' },
  { role: 'Policy Professionals',  quote: 'KYC gives me cited evidence for budget submissions in minutes.'          },
];

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string; session_id?: string }>;
}) {
  const session        = await getEffectiveServerSession();
  const hasPro         = isPremium(session);
  const params         = await searchParams;
  const paymentsEnabled = env.PAYMENTS_ENABLED;
  const paymentProvider = env.PAYMENT_PROVIDER;
  const providerLabel   = getPaymentProviderLabel(paymentProvider);

  const proMonthly = PLANS.find((p) => p.id === 'monthly');
  const proAnnual  = PLANS.find((p) => p.id === 'annual');
  const freePlan   = PLANS.find((p) => p.id === 'free');

  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="subscribe-hero">
        <div className="container">
          <span className="badge badge-gold" style={{ marginBottom: 18, display: 'inline-flex', fontSize: 10 }}>
            ★ KYC Pro
          </span>
          <h1 className="serif" style={{ fontSize: 'clamp(32px,5.5vw,58px)', margin: '0 0 16px', lineHeight: 1.05, letterSpacing: '-.02em' }}>
            Premium commodity intelligence.<br />
            <span style={{ color: 'var(--green)' }}>No noise. Just signal.</span>
          </h1>
          <p style={{ fontSize: 'clamp(14px,2vw,18px)', color: 'var(--muted)', maxWidth: 520, margin: '0 auto 28px', lineHeight: 1.7 }}>
            Join analysts, traders, and agri-professionals who rely on KYC for
            real data, deep analysis, and deterministic price forecasting.
          </p>

          {/* Social proof strip */}
          <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { val: '91+',    label: 'Mandis tracked'    },
              { val: '14-day', label: 'Forecast horizon'   },
              { val: 'GBRT',   label: 'Champion model'     },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Lora,serif', fontSize: 22, fontWeight: 700, color: 'var(--green)', lineHeight: 1.1 }}>{s.val}</div>
                <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Notices ──────────────────────────────────────────── */}
      <div className="container">
        {params.cancelled && !hasPro && (
          <div className="notice notice-yellow" style={{ maxWidth: 560, margin: '24px auto 0', textAlign: 'center' }}>
            Checkout cancelled — no charge was made. You can try again whenever you&apos;re ready.
          </div>
        )}
        {hasPro && (
          <div className="notice notice-green" style={{ maxWidth: 560, margin: '24px auto 0', textAlign: 'center' }}>
            <p style={{ marginBottom: env.STRIPE_ENABLED ? 12 : 0 }}>✓ You have an active KYC Pro subscription.</p>
            {env.STRIPE_ENABLED && <ManageSubscriptionButton />}
          </div>
        )}
        {!session && (
          <div className="notice" style={{ maxWidth: 560, margin: '24px auto 0', textAlign: 'center' }}>
            <Link href="/login" style={{ color: 'var(--gold)' }}>Log in</Link> or{' '}
            <Link href="/register" style={{ color: 'var(--gold)' }}>create an account</Link>{' '}
            to subscribe.
          </div>
        )}
        {session && paymentProvider === 'razorpay' && !hasPro && (
          <div className="notice notice-yellow" style={{ maxWidth: 680, margin: '24px auto 0' }}>
            <strong>Razorpay checkout:</strong>{' '}
            {env.RAZORPAY_API_ENABLED
              ? 'Your payment link will be created for this account and access activated automatically after payment.'
              : 'Use the same email and mobile as your KYC account at checkout for access reconciliation. Activation is not yet automated in this fallback mode.'}
          </div>
        )}
      </div>

      {/* ── Plan comparison ──────────────────────────────────── */}
      <div className="container">
        <div className="subscribe-comparison">

          {/* Free tier */}
          <div className="card subscribe-plan">
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 10 }}>
                {freePlan?.name ?? 'Free'}
              </div>
              <div className="subscribe-price-row">
                <span className="subscribe-price">₹0</span>
                <span className="subscribe-period">/forever</span>
              </div>
            </div>

            <hr className="divider" />

            <ul className="subscribe-feature-list">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="subscribe-feature-item">
                  <span className="subscribe-feature-check">✓</span>
                  <span className="subscribe-feature-muted">{f}</span>
                </li>
              ))}
            </ul>

            <div>
              {session ? (
                <button className="btn btn-full" disabled style={{ justifyContent: 'center', opacity: 0.5 }}>
                  Already registered
                </button>
              ) : (
                <Link href="/register" className="btn btn-full" style={{ display: 'flex', justifyContent: 'center' }}>
                  Get started free
                </Link>
              )}
            </div>
          </div>

          {/* Pro tier */}
          <div className="card-elevated subscribe-plan subscribe-plan-pro" style={{ position: 'relative' }}>
            <div className="subscribe-pro-badge">MOST POPULAR</div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--green)', textTransform: 'uppercase', marginBottom: 10 }}>
                KYC Pro
              </div>
              {/* Dual pricing */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 8 }}>
                <div>
                  <div className="subscribe-price-row">
                    <span className="subscribe-price" style={{ fontSize: 'clamp(26px,4vw,36px)' }}>
                      {proMonthly?.price ?? '₹499'}
                    </span>
                    <span className="subscribe-period">/mo</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 2 }}>Monthly</div>
                </div>
                <div>
                  <div className="subscribe-price-row">
                    <span className="subscribe-price" style={{ fontSize: 'clamp(26px,4vw,36px)' }}>
                      {proAnnual?.price ?? '₹5,000'}
                    </span>
                    <span className="subscribe-period">/yr</span>
                  </div>
                  <div className="subscribe-savings" style={{ marginTop: 2 }}>Save 17%</div>
                </div>
              </div>
            </div>

            <hr className="divider" />

            <ul className="subscribe-feature-list">
              {PRO_FEATURES.map((f) => (
                <li key={f.label} className="subscribe-feature-item">
                  <span className="subscribe-feature-check">✓</span>
                  <div>
                    <div style={{ fontWeight: 500 }}>{f.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 2 }}>{f.sub}</div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Subscribe buttons */}
            <div style={{ display: 'grid', gap: 10 }}>
              {session && session.plan === 'monthly' && session.sub_status === 'active' ? (
                <button className="btn btn-full" disabled style={{ justifyContent: 'center', opacity: 0.6 }}>
                  ✓ Current plan
                </button>
              ) : paymentsEnabled && session && proMonthly ? (
                <>
                  <SubscribeButton
                    planName={proMonthly.name}
                    price={proMonthly.price}
                    period={proMonthly.period}
                    featured={true}
                    plan="monthly"
                    providerLabel={providerLabel}
                  />
                  {proAnnual && (
                    <SubscribeButton
                      planName={proAnnual.name}
                      price={proAnnual.price}
                      period={proAnnual.period}
                      featured={false}
                      plan="annual"
                      providerLabel={providerLabel}
                    />
                  )}
                </>
              ) : !session ? (
                <Link href="/login" className="btn btn-primary btn-full" style={{ display: 'flex', justifyContent: 'center' }}>
                  Log in to subscribe
                </Link>
              ) : (
                <button className="btn btn-full" disabled style={{ justifyContent: 'center', opacity: 0.5 }}>
                  Payments unavailable
                </button>
              )}
            </div>

            <p style={{ fontSize: 11, color: 'var(--dim)', textAlign: 'center', margin: '4px 0 0' }}>
              Cancel anytime · No lock-in · Instant access
            </p>
          </div>
        </div>

        {/* ── Persona quotes ─────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: 14, padding: '8px 0 40px' }}>
          {PERSONAS.map((p) => (
            <div key={p.role} className="card" style={{ padding: '20px 18px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                {p.role}
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.65, fontStyle: 'italic', margin: 0 }}>
                &ldquo;{p.quote}&rdquo;
              </p>
            </div>
          ))}
        </div>

        {/* ── What&apos;s included ──────────────────────────────── */}
        <div className="subscribe-included">
          <h2 className="serif" style={{ fontSize: 28, marginBottom: 8, textAlign: 'center' }}>Everything in KYC Pro</h2>
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14, marginBottom: 28 }}>
            One subscription. All the tools.
          </p>
          <div className="subscribe-included-grid">
            {INCLUDED.map((f) => (
              <div key={f.title} className="subscribe-included-card card">
                <div className="subscribe-included-icon">{f.icon}</div>
                <div className="subscribe-included-title">{f.title}</div>
                <div className="subscribe-included-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
