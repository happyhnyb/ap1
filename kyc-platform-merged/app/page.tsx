import type { Metadata } from 'next';
import Link from 'next/link';
import Feed from '@/components/feed/Feed';
import { PlatformHeroStrip } from '@/components/layout/PlatformHeroStrip';
import { postsAdapter } from '@/lib/adapters';

export const metadata: Metadata = {
  title: 'Know Your Commodity — India\'s Commodity Intelligence Terminal',
  description: 'Real mandi prices, GBRT forecasting, and deep commodity analysis for India\'s agricultural markets. 14-day price horizon, 91+ markets, AI-powered search.',
};

export const revalidate = 300;

export default async function HomePage() {
  const posts = await postsAdapter.listPublished();

  return (
    <>
      {/* ── Platform Hero ────────────────────────────────────── */}
      <section className="platform-hero">
        <div className="platform-hero-mesh" aria-hidden="true" />
        <div className="container">
          <div className="platform-hero-inner">

            <div className="platform-hero-label">
              <span className="badge badge-green" style={{ fontSize: 9 }}>● LIVE</span>
              <span className="platform-hero-label-text">
                91+ mandis · Agmarknet data · GBRT forecasting
              </span>
            </div>

            <h1 className="platform-hero-headline serif">
              India&apos;s commodity<br />intelligence terminal.
            </h1>

            <p className="platform-hero-sub">
              Real-time mandi prices, champion-model forecasting with 14-day horizon,
              and deep analytical coverage — built for traders, agronomists, and
              policy professionals.
            </p>

            <div className="platform-hero-ctas">
              <Link href="/premium/predictor" className="btn btn-primary btn-lg">
                ⚡ Open Predictor
              </Link>
              <Link href="/feed" className="btn btn-lg">
                Browse Analysis →
              </Link>
            </div>

            {/* Live price strip — data from Agmarknet */}
            <PlatformHeroStrip />
          </div>
        </div>
      </section>

      {/* ── Trust strip ──────────────────────────────────────── */}
      <div className="platform-trust">
        <div className="container">
          <div className="platform-trust-inner">
            {[
              { val: '91+',    label: 'Active Mandis'       },
              { val: '9,300+', label: 'Daily Price Records' },
              { val: '24',     label: 'Commodities'         },
              { val: 'GBRT',   label: 'Champion Model'      },
              { val: '14-day', label: 'Forecast Horizon'    },
            ].map((s) => (
              <div key={s.label} className="platform-stat">
                <span className="platform-stat-val">{s.val}</span>
                <span className="platform-stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Capability cards ─────────────────────────────────── */}
      <div className="container">
        <div className="platform-features">
          <Link href="/premium/predictor" className="platform-feature-card card">
            <div className="platform-feature-icon">⚡</div>
            <div className="platform-feature-header">
              <h3 className="platform-feature-title">Price Predictor</h3>
              <span className="badge badge-gold" style={{ fontSize: 9 }}>★ Pro</span>
            </div>
            <p className="platform-feature-desc">
              Champion-challenger model selection via rolling-origin cross-validation.
              GBRT with quantile bands + Holt-Winters ensemble. 14-day horizon.
            </p>
            <div className="platform-feature-cta">Open Predictor →</div>
          </Link>

          <Link href="/search" className="platform-feature-card card">
            <div className="platform-feature-icon">✦</div>
            <div className="platform-feature-header">
              <h3 className="platform-feature-title">AI Search</h3>
              <span className="badge" style={{ fontSize: 9 }}>Semantic</span>
            </div>
            <p className="platform-feature-desc">
              Ask market questions, get cited answers from our full editorial
              library. Understands commodity aliases, state names, and seasonal context.
            </p>
            <div className="platform-feature-cta">Try Search →</div>
          </Link>

          <Link href="/feed" className="platform-feature-card card">
            <div className="platform-feature-icon">📊</div>
            <div className="platform-feature-header">
              <h3 className="platform-feature-title">Market Analysis</h3>
              <span className="badge" style={{ fontSize: 9 }}>Editorial</span>
            </div>
            <p className="platform-feature-desc">
              Deep dives into commodity markets, mandi trends, seasonal price
              patterns, and policy impacts written by subject-matter experts.
            </p>
            <div className="platform-feature-cta">Browse Analysis →</div>
          </Link>
        </div>
      </div>

      {/* ── Editorial feed ───────────────────────────────────── */}
      <Feed posts={posts} />
    </>
  );
}
