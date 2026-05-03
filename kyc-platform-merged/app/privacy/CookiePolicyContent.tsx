import Link from 'next/link';

const EFFECTIVE_DATE = '3 May 2026';

export function CookiePolicyContent() {
  return (
    <div className="card post-card cookie-policy-card">
      <div className="cookie-policy-hero">
        <p className="cookie-policy-kicker">Effective {EFFECTIVE_DATE}</p>
        <h1 className="serif cookie-policy-title">Privacy Policy &amp; Cookie Disclosure</h1>
        <p className="cookie-policy-lead">
          Know Your Commodity is operated by HnyB Tech Incubations Pvt. Ltd. We comply with GDPR and India&apos;s
          DPDP Act and explain here how we use cookies, tracking technologies, and contact channels for privacy
          matters.
        </p>
      </div>

      <section className="cookie-policy-section">
        <h2 className="serif">1. Corporate Information</h2>
        <div className="cookie-policy-table">
          <div className="cookie-policy-row">
            <strong>Company</strong>
            <span>HnyB Tech Incubations Pvt. Ltd.</span>
          </div>
          <div className="cookie-policy-row">
            <strong>CIN</strong>
            <span>U74999GJ2014PTC079360</span>
          </div>
          <div className="cookie-policy-row">
            <strong>Location</strong>
            <span>Ahmedabad – 380052, India</span>
          </div>
          <div className="cookie-policy-row">
            <strong>Billing contact</strong>
            <span>
              <a href="mailto:billing@kycagri.com" style={{ color: 'var(--green)' }}>
                billing@kycagri.com
              </a>
            </span>
          </div>
        </div>
      </section>

      <section className="cookie-policy-section">
        <h2 className="serif">2. Data Protection &amp; Privacy</h2>
        <p>We comply with GDPR and India&apos;s DPDP Act.</p>
        <div className="cookie-policy-table" style={{ marginTop: 4 }}>
          <div className="cookie-policy-row">
            <strong>Grievance Officer</strong>
            <span>
              Niraj Shah —{' '}
              <a href="mailto:grievance@kycagri.com" style={{ color: 'var(--green)' }}>
                grievance@kycagri.com
              </a>
            </span>
          </div>
        </div>
      </section>

      <section className="cookie-policy-section">
        <h2 className="serif">3. Cookie Policy &amp; Tracking Disclosure</h2>
        <p>
          We use cookies and similar tracking technologies to enhance user experience, analyze traffic, and improve
          services.
        </p>
        <div className="cookie-policy-table">
          <div className="cookie-policy-row">
            <strong>Essential Cookies</strong>
            <span>Required for core functionality</span>
          </div>
          <div className="cookie-policy-row">
            <strong>Analytics Cookies</strong>
            <span>Measure traffic and usage behavior</span>
          </div>
          <div className="cookie-policy-row">
            <strong>Functional Cookies</strong>
            <span>Remember preferences</span>
          </div>
          <div className="cookie-policy-row">
            <strong>Marketing Cookies</strong>
            <span>Used for advertising and remarketing</span>
          </div>
        </div>
        <p>We may use third-party tools such as:</p>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Google Analytics</li>
          <li>Payment gateway trackers: Stripe, Razorpay</li>
          <li>Performance monitoring tools</li>
        </ul>
        <p>
          Cookies are used only after obtaining user consent where required by law. Users can accept or decline
          cookies via the banner.
        </p>
        <p>
          Users may disable cookies through browser settings. However, some features may not function properly.
        </p>
        <p>Collected data is used for:</p>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Improving platform performance</li>
          <li>Enhancing user experience</li>
          <li>Security and fraud prevention</li>
        </ul>
      </section>

      <section className="cookie-policy-section">
        <h2 className="serif">4. Contact</h2>
        <p>
          For terms, refunds, billing, or service limitations, see our{' '}
          <Link href="/terms">Terms &amp; Conditions</Link>.
        </p>
        <div className="cookie-policy-table">
          <div className="cookie-policy-row">
            <strong>Billing</strong>
            <span>
              <a href="mailto:billing@kycagri.com" style={{ color: 'var(--green)' }}>
                billing@kycagri.com
              </a>
            </span>
          </div>
          <div className="cookie-policy-row">
            <strong>GST</strong>
            <span>
              <a href="mailto:gst@kycagri.com" style={{ color: 'var(--green)' }}>
                gst@kycagri.com
              </a>
            </span>
          </div>
          <div className="cookie-policy-row">
            <strong>Grievance</strong>
            <span>
              <a href="mailto:grievance@kycagri.com" style={{ color: 'var(--green)' }}>
                grievance@kycagri.com
              </a>
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
