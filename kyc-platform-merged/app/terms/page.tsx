import type { Metadata } from 'next';
import Link from 'next/link';

const EFFECTIVE_DATE = '3 May 2026';

const sectionTitleStyle = {
  fontSize: 20,
  margin: 0,
  borderLeft: '3px solid var(--green)',
  paddingLeft: 12,
} as const;

const bodyStyle = {
  lineHeight: 1.8,
  color: 'var(--text2)',
  margin: 0,
  fontSize: 14,
} as const;

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description:
    'Terms and conditions for Know Your Commodity by HnyB Tech Incubations Pvt. Ltd., including privacy, payments, refunds, cookies, and governing law.',
};

export default function TermsPage() {
  return (
    <main className="container section" style={{ paddingBottom: 60 }}>
      <div
        className="card post-card"
        style={{ padding: '32px 28px', display: 'grid', gap: 28, maxWidth: 860, margin: '0 auto' }}
      >
        <div style={{ display: 'grid', gap: 8 }}>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              color: 'var(--green)',
            }}
          >
            Effective {EFFECTIVE_DATE}
          </p>
          <h1 className="serif" style={{ fontSize: 'clamp(28px,5vw,38px)', margin: 0, lineHeight: 1.1 }}>
            Terms &amp; Conditions
          </h1>
          <p style={{ color: 'var(--muted)', marginTop: 4, lineHeight: 1.7, fontSize: 14 }}>
            Know Your Commodity
          </p>
        </div>

        <section style={{ display: 'grid', gap: 12 }}>
          <h2 className="serif" style={sectionTitleStyle}>
            1. Corporate Information
          </h2>
          <div style={{ border: '1px solid var(--border2)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            {[
              ['Company', 'HnyB Tech Incubations Pvt. Ltd.'],
              ['CIN', 'U74999GJ2014PTC079360'],
              ['Location', 'Ahmedabad – 380052, India'],
            ].map(([label, value], index, rows) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '11px 16px',
                  borderBottom: index === rows.length - 1 ? 'none' : '1px solid var(--border)',
                  fontSize: 13.5,
                }}
              >
                <span style={{ width: 90, flexShrink: 0, fontWeight: 600, color: 'var(--muted)', fontSize: 12 }}>
                  {label}
                </span>
                <span>{value}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 12, padding: '11px 16px', fontSize: 13.5 }}>
              <span style={{ width: 90, flexShrink: 0, fontWeight: 600, color: 'var(--muted)', fontSize: 12 }}>
                Email
              </span>
              <a href="mailto:billing@kycagri.com" style={{ color: 'var(--green)' }}>
                billing@kycagri.com
              </a>
            </div>
          </div>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <h2 className="serif" style={sectionTitleStyle}>
            2. Scope of Services
          </h2>
          <p style={bodyStyle}>Informational AI-powered commodity insights. No advisory services.</p>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <h2 className="serif" style={sectionTitleStyle}>
            3. Disclaimer
          </h2>
          <p style={bodyStyle}>No financial advice. Use at your own risk.</p>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <h2 className="serif" style={sectionTitleStyle}>
            4. Data Protection &amp; Privacy
          </h2>
          <p style={bodyStyle}>
            We comply with GDPR and India&apos;s DPDP Act. For details on cookies, tracking, and data handling, please
            review our <Link href="/privacy" style={{ color: 'var(--green)' }}>Privacy Policy</Link>.
          </p>
          <div
            style={{
              border: '1px solid rgba(76,175,80,.22)',
              borderRadius: 'var(--radius)',
              background: 'rgba(76,175,80,.05)',
              padding: '16px 20px',
              display: 'grid',
              gap: 4,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                color: 'var(--green)',
              }}
            >
              Grievance Officer
            </p>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Niraj Shah</p>
            <a href="mailto:grievance@kycagri.com" style={{ color: 'var(--green)', fontSize: 13.5 }}>
              grievance@kycagri.com
            </a>
          </div>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <h2 className="serif" style={sectionTitleStyle}>
            5. Payments &amp; GST
          </h2>
          <p style={bodyStyle}>All prices include applicable taxes.</p>
          <p style={bodyStyle}>Indian entities: 18% GST included.</p>
          <p style={bodyStyle}>Invoices shared by 5th of next month.</p>
          <p style={bodyStyle}>
            GST queries:{' '}
            <a href="mailto:gst@kycagri.com" style={{ color: 'var(--green)' }}>
              gst@kycagri.com
            </a>
            . Include payment details + GSTIN.
          </p>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <h2 className="serif" style={sectionTitleStyle}>
            6. Refund Policy
          </h2>
          <p style={bodyStyle}>No refunds for digital services.</p>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <h2 className="serif" style={sectionTitleStyle}>
            7. Limitation of Liability
          </h2>
          <p style={bodyStyle}>No liability for losses or inaccuracies.</p>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <h2 className="serif" style={sectionTitleStyle}>
            8. Governing Law
          </h2>
          <p style={bodyStyle}>India, jurisdiction Ahmedabad.</p>
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          <h2 className="serif" style={sectionTitleStyle}>
            9. Cookie Policy &amp; Tracking Disclosure
          </h2>
          <p style={bodyStyle}>
            We use cookies and similar tracking technologies to enhance user experience, analyze traffic, and improve
            services.
          </p>
          <div style={{ border: '1px solid var(--border2)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            {[
              ['Essential Cookies', 'Required for core functionality'],
              ['Analytics Cookies', 'Measure traffic and usage behavior'],
              ['Functional Cookies', 'Remember preferences'],
              ['Marketing Cookies', 'Used for advertising and remarketing'],
            ].map(([label, value], index, rows) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom: index === rows.length - 1 ? 'none' : '1px solid var(--border)',
                  fontSize: 13.5,
                }}
              >
                <span style={{ width: 150, flexShrink: 0, fontWeight: 600 }}>{label}</span>
                <span style={{ color: 'var(--text2)' }}>{value}</span>
              </div>
            ))}
          </div>
          <p style={bodyStyle}>Third-Party Tracking</p>
          <p style={bodyStyle}>We may use third-party tools such as:</p>
          <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text2)', lineHeight: 1.8, fontSize: 14 }}>
            <li>Google Analytics</li>
            <li>Payment gateway trackers: Stripe, Razorpay</li>
            <li>Performance monitoring tools</li>
          </ul>
          <p style={bodyStyle}>
            Cookies are used only after obtaining user consent where required by law. Users can accept or decline
            cookies via the banner.
          </p>
          <p style={bodyStyle}>
            Users may disable cookies through browser settings. However, some features may not function properly.
          </p>
          <p style={bodyStyle}>Collected data is used for:</p>
          <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text2)', lineHeight: 1.8, fontSize: 14 }}>
            <li>Improving platform performance</li>
            <li>Enhancing user experience</li>
            <li>Security and fraud prevention</li>
          </ul>
        </section>

        <section style={{ display: 'grid', gap: 12 }}>
          <h2 className="serif" style={sectionTitleStyle}>
            10. Contact
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            {[
              ['Billing', 'billing@kycagri.com'],
              ['GST', 'gst@kycagri.com'],
              ['Grievance', 'grievance@kycagri.com'],
            ].map(([label, email]) => (
              <a
                key={email}
                href={`mailto:${email}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                  padding: '14px 16px',
                  border: '1px solid var(--border2)',
                  borderRadius: 'var(--radius)',
                  background: 'rgba(255,255,255,.025)',
                  textDecoration: 'none',
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                    color: 'var(--dim)',
                  }}
                >
                  {label}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--green)' }}>{email}</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
