import Link from 'next/link';

export default function PredictorPaywall() {
  return (
    <main className="container" style={{ paddingBottom: 80 }}>
      {/* Blurred preview header */}
      <div style={{ padding: '40px 0 28px', borderBottom: '1px solid var(--border)', marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 28 }}>⚡</span>
          <h1 className="serif" style={{ fontSize: 32, margin: 0 }}>Commodity Price Predictor</h1>
          <span className="badge badge-gold">★ Pro</span>
        </div>
        <p style={{ color: 'var(--muted)', margin: 0 }}>Live Agmarknet data · 14-day forecast · Holt trend model</p>
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
        <span className="badge badge-gold" style={{ marginBottom: 16, display: 'inline-flex' }}>★ KYC Pro Feature</span>
        <h2 className="serif" style={{ fontSize: 26, margin: '0 0 10px' }}>Unlock the Predictor</h2>
        <p style={{ color: 'var(--muted)', fontSize: 15, margin: '0 0 24px', lineHeight: 1.65 }}>
          Access live mandi prices, 14-day commodity forecasts, market comparisons, and trend analysis for wheat, onion, soybean, cotton, and 50+ more crops.
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
          <Link href="/subscribe" className="btn btn-gold btn-lg">Subscribe from ₹499/month</Link>
          <Link href="/" className="btn btn-lg">Back to feed</Link>
        </div>
      </div>
    </main>
  );
}
