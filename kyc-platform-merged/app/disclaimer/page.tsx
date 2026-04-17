import type { Metadata } from 'next';
import { PREDICTOR_DISCLAIMER } from '@/lib/product/predictor';

export const metadata: Metadata = {
  title: 'Forecast Methodology',
  description: 'How KYC Agri forecast analysis works, what data it uses, and what its limitations are.',
};

export default function DisclaimerPage() {
  return (
    <main className="container section">
      <div className="card post-card" style={{ padding: 24, display: 'grid', gap: 18 }}>
        <div>
          <h1 className="serif" style={{ fontSize: 'clamp(30px,5vw,40px)', margin: 0 }}>Disclaimer and Forecast Methodology</h1>
          <p style={{ color: 'var(--muted)', marginTop: 10, lineHeight: 1.7 }}>
            KYC forecast outputs are model-generated analysis built on trusted internal and external data sources. They are designed to support research, not replace judgment.
          </p>
        </div>
        <div className="notice notice-yellow">
          <strong>Important disclaimer</strong>
          <div style={{ marginTop: 6 }}>{PREDICTOR_DISCLAIMER}</div>
        </div>
        <p style={{ lineHeight: 1.75 }}>
          Our forecast surfaces combine historical mandi pricing, source freshness, quality checks, and model outputs to present an indicative directional view. We may also use supporting data from related internal sources, policy signals, and structured AI explanation layers where appropriate.
        </p>
        <p style={{ lineHeight: 1.75 }}>
          Forecasts may be wrong. Market conditions can change quickly because of weather, logistics, policy, local supply changes, reporting delays, and other factors that no model fully captures.
        </p>
        <p style={{ lineHeight: 1.75 }}>
          AI is used to summarize, explain, and structure forecast context. It is not used as the source of truth for numeric price values. Numeric outputs should always be interpreted alongside source data, market knowledge, and independent verification.
        </p>
        <p style={{ lineHeight: 1.75 }}>
          If you rely on this information for operational, trading, procurement, or investment decisions, you should cross-check the underlying market data and use additional professional judgment.
        </p>
      </div>
    </main>
  );
}
