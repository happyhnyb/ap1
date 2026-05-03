import Link from 'next/link';
import Script from 'next/script';
import type { Metadata } from 'next';
import { getEffectiveServerSession } from '@/lib/auth/current-user';
import { env } from '@/lib/env';
import { getPredictorReleaseMode, PREDICTOR_DISCLAIMER } from '@/lib/product/predictor';
import { getPaymentProvider, getPaymentProviderLabel } from '@/lib/payments/provider';
import { RAZORPAY_PLAN_AMOUNT } from '@/lib/payments/razorpay';
import { SubscribeButton } from '@/components/subscribe/SubscribeButton';

export const metadata: Metadata = {
  title: 'Access',
  description: 'Create an account, review current research access options, and see which KYC Agri tools are live today.',
};

const ACCESS_BLOCKS = [
  {
    title: 'Free account',
    summary: 'Read public coverage, save your session, and use core site features.',
  },
  {
    title: 'Predictor access',
    summary: 'AI-assisted commodity forecast analysis with live data, quality notes, and model context.',
  },
  {
    title: 'AI search and premium research',
    summary: 'Structured search, explainers, and expanded research access remain staged for future rollout.',
  },
];

export default async function SubscribePage() {
  const session = await getEffectiveServerSession();
  const predictorMode = getPredictorReleaseMode();
  const billingLive = env.PAYMENTS_ENABLED;
  const provider = getPaymentProvider();
  const providerLabel = getPaymentProviderLabel(provider);

  return (
    <main>
      {provider === 'razorpay' && <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />}
      <div className="subscribe-hero">
        <div className="container">
          <span className="badge badge-gold" style={{ marginBottom: 18, display: 'inline-flex', fontSize: 10 }}>
            Research access
          </span>
          <h1 className="serif" style={{ fontSize: 'clamp(32px,5.5vw,58px)', margin: '0 0 16px', lineHeight: 1.05, letterSpacing: '-.02em' }}>
            KYC access is being rolled out in phases.
          </h1>
          <p style={{ fontSize: 'clamp(14px,2vw,18px)', color: 'var(--muted)', maxWidth: 620, margin: '0 auto 28px', lineHeight: 1.7 }}>
            Account creation is live. The predictor is available in release mode today. Premium access can be unlocked online when billing is enabled.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {session ? (
              <Link href="/premium/predictor" className="btn btn-primary btn-lg">
                Open predictor
              </Link>
            ) : (
              <Link href="/register" className="btn btn-primary btn-lg">
                Create free account
              </Link>
            )}
            <Link href="/contact" className="btn btn-lg">
              Contact KYC
            </Link>
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingBottom: 56 }}>
        <div className="notice notice-yellow" style={{ maxWidth: 860, margin: '24px auto 28px' }}>
          <strong>Online billing status</strong>
          <div style={{ marginTop: 6 }}>
            {billingLive
              ? `${providerLabel} checkout is enabled for premium access purchases.`
              : 'Billing is not active yet. No online payment is being processed from this page, and no checkout should be treated as live.'}
          </div>
        </div>

        <div className="subscribe-comparison" style={{ marginBottom: 28 }}>
          <div className="subscribe-plan">
            <div className="subscribe-price-row">
              <div className="subscribe-price">₹499</div>
              <div className="subscribe-period">per month</div>
            </div>
            <ul className="subscribe-feature-list" style={{ margin: '16px 0 18px', padding: 0 }}>
              <li className="subscribe-feature-item"><span className="subscribe-feature-check">✓</span> Monthly KYC Pro access</li>
              <li className="subscribe-feature-item"><span className="subscribe-feature-check">✓</span> Premium articles and AI tools</li>
              <li className="subscribe-feature-item"><span className="subscribe-feature-check">✓</span> Cancel or change later through support</li>
            </ul>
            {billingLive ? (
              <SubscribeButton
                planName="Monthly Pro"
                price="₹499"
                period="/month"
                featured={false}
                plan="monthly"
                provider={provider}
                providerLabel={providerLabel}
                amountPaise={RAZORPAY_PLAN_AMOUNT.monthly}
                razorpayKeyId={env.NEXT_PUBLIC_RAZORPAY_KEY_ID}
              />
            ) : (
              <Link href="/contact" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                Ask about monthly access
              </Link>
            )}
          </div>

          <div className="subscribe-plan subscribe-plan-pro">
            <div className="subscribe-pro-badge">Best value</div>
            <div className="subscribe-price-row">
              <div className="subscribe-price">₹4999</div>
              <div className="subscribe-period">per year</div>
            </div>
            <div className="subscribe-savings">Save compared with paying monthly</div>
            <ul className="subscribe-feature-list" style={{ margin: '16px 0 18px', padding: 0 }}>
              <li className="subscribe-feature-item"><span className="subscribe-feature-check">✓</span> Annual KYC Pro access</li>
              <li className="subscribe-feature-item"><span className="subscribe-feature-check">✓</span> Predictor, premium research, and AI search</li>
              <li className="subscribe-feature-item"><span className="subscribe-feature-check">✓</span> Lower effective monthly price</li>
            </ul>
            {billingLive ? (
              <SubscribeButton
                planName="Annual Pro"
                price="₹4999"
                period="/year"
                featured={true}
                plan="annual"
                provider={provider}
                providerLabel={providerLabel}
                amountPaise={RAZORPAY_PLAN_AMOUNT.annual}
                razorpayKeyId={env.NEXT_PUBLIC_RAZORPAY_KEY_ID}
              />
            ) : (
              <Link href="/contact" className="btn btn-gold" style={{ width: '100%', justifyContent: 'center' }}>
                Ask about annual access
              </Link>
            )}
          </div>
        </div>

        <div className="grid-3" style={{ marginBottom: 28 }}>
          {ACCESS_BLOCKS.map((block) => (
            <div key={block.title} className="card" style={{ padding: 22 }}>
              <div style={{ fontFamily: 'Lora,serif', fontSize: 22, fontWeight: 700, marginBottom: 10 }}>{block.title}</div>
              <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.7, margin: 0 }}>{block.summary}</p>
            </div>
          ))}
        </div>

        <div className="card-elevated" style={{ padding: '28px 24px', marginBottom: 20 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 8 }}>
                Predictor release mode
              </div>
              <h2 className="serif" style={{ fontSize: 28, margin: 0 }}>
                {predictorMode === 'public' ? 'Public access' : predictorMode === 'auth' ? 'Signed-in access' : 'Restricted access'}
              </h2>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.7, margin: 0 }}>
              The predictor is currently treated as an AI-assisted forecast analysis tool. It is intended for research support and internal market review, not as financial advice.
            </p>
            <div className="notice notice-gold" style={{ fontSize: 13 }}>
              <strong>Important disclaimer</strong>
              <div style={{ marginTop: 6 }}>{PREDICTOR_DISCLAIMER}</div>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 8 }}>
            What to do now
          </div>
          <div style={{ display: 'grid', gap: 10, color: 'var(--muted)', fontSize: 14 }}>
            <div>1. Create an account if you want saved sessions and account-based access.</div>
            <div>2. Use the predictor according to the current release mode.</div>
            <div>3. Reach out via the contact page for enterprise access, pilots, or pricing discussions while billing remains offline.</div>
          </div>
        </div>
      </div>
    </main>
  );
}
