import type { Metadata } from 'next';
import Feed from '@/components/feed/Feed';
import { postsAdapter } from '@/lib/adapters';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Know Your Commodity — Global Agriculture & Commodity Markets',
  description: 'Deep analysis, mandi prices, and commodity forecasting for global agriculture and commodity markets. Follow wheat, rice, soybean, cotton, onion, and more.',
};

// Revalidate home page every 5 minutes
export const revalidate = 300;

export default async function HomePage() {
  const posts = await postsAdapter.listPublished();

  return (
    <>
      {/* Masthead */}
      <div style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,.15)' }}>
        <div className="container" style={{ padding: '18px 0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--dim)', letterSpacing: '.04em' }}>
              GLOBAL AGRICULTURE &amp; COMMODITY INTELLIGENCE PLATFORM
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/feed" className="btn btn-sm" style={{ fontSize: 12 }}>Browse all stories →</Link>
            <Link href="/premium/predictor" className="btn btn-sm" style={{ fontSize: 12, color: 'var(--gold)', borderColor: 'rgba(255,193,7,.3)' }}>⚡ Price Predictor</Link>
          </div>
        </div>
      </div>

      {/* Main editorial feed */}
      <Feed posts={posts} />
    </>
  );
}
