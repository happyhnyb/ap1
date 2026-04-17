import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: 'Terms of use for Know Your Commodity and KYC Agri products.',
};

export default function TermsPage() {
  return (
    <main className="container section">
      <div className="card post-card" style={{ padding: 24, display: 'grid', gap: 18 }}>
        <div>
          <h1 className="serif" style={{ fontSize: 'clamp(30px,5vw,40px)', margin: 0 }}>Terms of Use</h1>
          <p style={{ color: 'var(--muted)', marginTop: 10, lineHeight: 1.7 }}>
            By using this site, you agree to use it lawfully, respect account security, and avoid interfering with the platform or other users.
          </p>
        </div>
        <p style={{ lineHeight: 1.75 }}>
          KYC content, research tools, and product features are provided for informational purposes. Access tiers, feature availability, and service limits may change as the product evolves.
        </p>
        <p style={{ lineHeight: 1.75 }}>
          You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. We may suspend or restrict access where misuse, abuse, or security concerns are detected.
        </p>
        <p style={{ lineHeight: 1.75 }}>
          We do not guarantee uninterrupted availability, perfect accuracy, or suitability for any particular commercial decision. Use the service as one input among others, and verify critical information independently.
        </p>
        <p style={{ lineHeight: 1.75 }}>
          All site content, branding, and software remain the property of their respective owners unless otherwise stated. Do not reproduce or redistribute protected content without permission.
        </p>
      </div>
    </main>
  );
}
