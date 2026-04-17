import Link from 'next/link';
import { getPredictorReleaseMode } from '@/lib/product/predictor';
import { PredictorDisclaimer } from './PredictorDisclaimer';

export default function PredictorPaywall() {
  const mode = getPredictorReleaseMode();
  const authOnly = mode === 'auth';

  return (
    <main className="container" style={{ paddingBottom: 80 }}>
      {/* Blurred preview header */}
      <div style={{ padding: '40px 0 28px', borderBottom: '1px solid var(--border)', marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 28 }}>⚡</span>
          <h1 className="serif" style={{ fontSize: 32, margin: 0 }}>Commodity Price Predictor</h1>
          <span className="badge badge-gold">{authOnly ? 'Account access' : 'Research access'}</span>
        </div>
        <p style={{ color: 'var(--muted)', margin: 0 }}>Live Agmarknet data · AI-assisted forecast analysis · model-based directional outlook</p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <PredictorDisclaimer />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32, filter: 'blur(4px)', opacity: 0.4, pointerEvents: 'none', userSelect: 'none' }}>
        {[['Wheat', '₹2,380', '+1.2%'], ['Onion', '₹28', '+3.1%'], ['Soybean', '₹4,120', '+2.4%'], ['Cotton', '₹6,890', '+0.5%']].map(([crop, price, change]) => (
          <div key={crop} className="card metric-card">
            <div className="metric-label">{crop}</div>
            <div className="metric-val" style={{ color: 'var(--green)' }}>{price}</div>
            <div style={{ fontSize: 13, color: 'var(--green)' }}>{change} vs yesterday</div>
          </div>
        ))}
      </div>

      {/* Paywall */}
      <div className="card-elevated" style={{ padding: '40px 36px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(255,193,7,.06) 0%, rgba(76,175,80,.04) 100%)', maxWidth: 560, margin: '0 auto' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚡</div>
        <span className="badge badge-gold" style={{ marginBottom: 16, display: 'inline-flex' }}>
          {authOnly ? 'Sign in required' : 'Restricted access'}
        </span>
        <h2 className="serif" style={{ fontSize: 26, margin: '0 0 10px' }}>
          {authOnly ? 'Sign in to use the predictor' : 'Predictor access is limited'}
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: 15, margin: '0 0 24px', lineHeight: 1.65 }}>
          Access live mandi prices, indicative multi-day forecast analysis, market comparisons, and model context for major commodities.
        </p>

        <div style={{ display: 'grid', gap: 10, textAlign: 'left', marginBottom: 28 }}>
          {[
            '📍 Pick commodity, state & market',
            '📈 30-day price history chart',
            '🔮 14-day price forecast with confidence band',
            '📊 Top markets sorted by modal price',
            '🔄 Data refreshed daily from Agmarknet',
          ].map((f) => (
            <div key={f} style={{ fontSize: 14, color: 'var(--muted)', display: 'flex', gap: 8 }}>{f}</div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href={authOnly ? '/login?from=/premium/predictor' : '/subscribe'} className="btn btn-gold btn-lg">
            {authOnly ? 'Sign in' : 'View access options'}
          </Link>
          <Link href="/" className="btn btn-lg">Back to feed</Link>
        </div>
      </div>
    </main>
  );
}
