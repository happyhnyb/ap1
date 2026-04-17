import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy policy for Know Your Commodity and KYC Agri products.',
};

export default function PrivacyPage() {
  return (
    <main className="container section">
      <div className="card post-card" style={{ padding: 24, display: 'grid', gap: 18 }}>
        <div>
          <h1 className="serif" style={{ fontSize: 'clamp(30px,5vw,40px)', margin: 0 }}>Privacy Policy</h1>
          <p style={{ color: 'var(--muted)', marginTop: 10, lineHeight: 1.7 }}>
            We collect the minimum information needed to operate the site, provide account access, and respond to user requests.
          </p>
        </div>
        <p style={{ lineHeight: 1.75 }}>
          Information you provide to us may include your name, email address, login credentials, contact form messages, and limited usage preferences. We use this information to authenticate users, improve site functionality, respond to support requests, and maintain service security.
        </p>
        <p style={{ lineHeight: 1.75 }}>
          We do not sell your personal information. We may use service providers for infrastructure, analytics, email, storage, and authentication support. Those providers only receive the information required to operate their part of the service.
        </p>
        <p style={{ lineHeight: 1.75 }}>
          Forecast and AI features may process user prompts and internal content in order to generate responses. We aim to minimize retained data and use environment-driven controls for storage where supported.
        </p>
        <p style={{ lineHeight: 1.75 }}>
          If you want your account information updated or removed, contact us through the contact page. We may retain limited records where required for security, audit, or legal reasons.
        </p>
      </div>
    </main>
  );
}
