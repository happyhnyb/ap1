import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Disclaimer',
  description: 'Legal disclaimer for Know Your Commodity and KYC Agri.',
};

export default function DisclaimerPage() {
  return (
    <main className="container section">
      <div className="card post-card" style={{ padding: 24, display: 'grid', gap: 18 }}>
        <div>
          <h1 className="serif" style={{ fontSize: 'clamp(30px,5vw,40px)', margin: 0 }}>
            Disclaimer
          </h1>
          <p style={{ color: 'var(--muted)', marginTop: 10, lineHeight: 1.7 }}>
            Know Your Commodity provides informational AI-powered commodity insights only.
          </p>
        </div>
        <div className="notice notice-yellow">
          <strong>Important disclaimer</strong>
          <div style={{ marginTop: 6 }}>No financial advice. Use at your own risk.</div>
        </div>
        <p style={{ lineHeight: 1.75 }}>
          The platform does not provide advisory, brokerage, or investment services. Any prices, summaries,
          forecasts, or market commentary are published for general informational purposes only.
        </p>
        <p style={{ lineHeight: 1.75 }}>
          Commodity markets can change quickly, and information may contain delays, omissions, or inaccuracies.
          Users remain fully responsible for how they interpret or rely on any content made available through the
          service.
        </p>
        <p style={{ lineHeight: 1.75 }}>
          By using this platform, you acknowledge that all use is at your own risk and that HnyB Tech Incubations
          Pvt. Ltd. is not liable for losses or inaccuracies arising from platform content or usage.
        </p>
      </div>
    </main>
  );
}
