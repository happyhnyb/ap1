import Link from 'next/link';
import Image from 'next/image';

export function Footer({
  predictorPublic = false,
}: {
  predictorPublic?: boolean;
}) {
  const predictorHref = predictorPublic ? '/premium/predictor' : '/login?from=/premium/predictor';

  return (
    <footer className="footer">
      <div className="container">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 32, marginBottom: 32 }}>
          <div>
            <div className="logo" style={{ marginBottom: 10 }}>
              <Image src="/logo.png" alt="KYC" width={36} height={36} style={{ borderRadius: '50%', filter: 'brightness(1.2)' }} />
              <span style={{ fontFamily: 'Lora,serif', fontWeight: 700, fontSize: 15 }}>Know Your Commodity</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.6, margin: 0 }}>
              Global commodity intelligence platform. Real data, deep analysis, actionable insights.
            </p>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 12 }}>Platform</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {[['/', 'Feed'], ['/search', 'Search'], [predictorHref, 'Predictor'], ['/subscribe', 'Access']].map(([href, label]) => (
                <Link key={href} href={href} style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</Link>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 12 }}>Company</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {[['/about', 'About'], ['/contact', 'Contact'], ['/privacy', 'Privacy'], ['/terms', 'Terms'], ['/disclaimer', 'Methodology'], ['/billing-policy', 'Billing policy']].map(([href, label]) => (
                <Link key={href} href={href} style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</Link>
              ))}
            </div>
          </div>
        </div>
        <div className="divider" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingTop: 20, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13 }}>© 2026 Know Your Commodity™ · All rights reserved</span>
          <span style={{ fontSize: 12, color: 'var(--dim)' }}>Data from Agmarknet · Powered by Next.js 15 + MongoDB</span>
        </div>
      </div>
    </footer>
  );
}
