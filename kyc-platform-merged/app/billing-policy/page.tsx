import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Billing Policy',
  description: 'Current billing and refund status for KYC Agri access.',
};

export default function BillingPolicyPage() {
  return (
    <main className="container section">
      <div className="card post-card" style={{ padding: 24, display: 'grid', gap: 18 }}>
        <div>
          <h1 className="serif" style={{ fontSize: 'clamp(30px,5vw,40px)', margin: 0 }}>Billing Policy</h1>
          <p style={{ color: 'var(--muted)', marginTop: 10, lineHeight: 1.7 }}>
            Online billing is not currently active on this site unless explicitly stated otherwise by KYC.
          </p>
        </div>
        <p style={{ lineHeight: 1.75 }}>
          During this release phase, account creation and product access may be available without online payment processing. If billing is activated later, this page will be updated with plan terms, renewal details, and refund handling.
        </p>
        <p style={{ lineHeight: 1.75 }}>
          Because online paid access is not currently being processed as a standard self-serve checkout flow, there is no active public refund workflow attached to this release. If you have a billing-related question, please contact KYC directly.
        </p>
        <p style={{ lineHeight: 1.75 }}>
          We will only describe billing as live once payment processing, entitlement updates, and support operations are fully ready for production use.
        </p>
      </div>
    </main>
  );
}
