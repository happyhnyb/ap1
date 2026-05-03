'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { CookieSettingsButton } from '@/components/layout/CookieSettingsButton';

export function LegalPolicyModal() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    document.body.style.overflow = '';
    if (triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleOpen = () => {
      triggerRef.current = document.activeElement as HTMLElement;
      setOpen(true);
    };
    window.addEventListener('kyc:open-legal-modal', handleOpen);
    return () => window.removeEventListener('kyc:open-legal-modal', handleOpen);
  }, []);

  useEffect(() => {
    if (!open) return;

    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key !== 'Tab' || !containerRef.current) return;
      const focusable = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    containerRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="legal-backdrop" onClick={close} aria-hidden="true">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
        className="legal-modal card-elevated"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Sticky header */}
        <div className="legal-modal-header">
          <div>
            <p className="legal-modal-kicker">Effective 3 May 2026</p>
            <h1 id="legal-modal-title" className="legal-modal-title serif">
              Terms &amp; Conditions
            </h1>
            <p className="legal-modal-subtitle">Know Your Commodity · HnyB Tech Incubations Pvt. Ltd.</p>
          </div>
          <button type="button" className="legal-modal-close" onClick={close} aria-label="Close legal policy">
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="legal-modal-body">

          <section className="legal-section">
            <h2 className="serif legal-section-h2">1. Corporate Information</h2>
            <div className="legal-info-card">
              <div className="legal-info-row">
                <span className="legal-info-label">Company</span>
                <span>HnyB Tech Incubations Pvt. Ltd.</span>
              </div>
              <div className="legal-info-row">
                <span className="legal-info-label">CIN</span>
                <span>U74999GJ2014PTC079360</span>
              </div>
              <div className="legal-info-row">
                <span className="legal-info-label">Location</span>
                <span>Ahmedabad – 380052, India</span>
              </div>
              <div className="legal-info-row">
                <span className="legal-info-label">Billing</span>
                <a href="mailto:billing@kycagri.com" className="legal-link">billing@kycagri.com</a>
              </div>
            </div>
          </section>

          <section className="legal-section">
            <h2 className="serif legal-section-h2">2. Scope of Services</h2>
            <p className="legal-text">
              Know Your Commodity provides an AI-powered commodity intelligence platform offering market data, price
              forecasts, research analysis, and related informational tools. All content and features are provided for
              informational purposes only.
            </p>
            <p className="legal-text">
              We do not provide financial advisory, investment advisory, or brokerage services. Our outputs — including
              AI-generated summaries, forecasts, and market narratives — are designed to support informed research and
              decision-making, not to replace independent professional advice.
            </p>
            <p className="legal-text">
              Access tiers, feature availability, and service limits may change as the platform evolves. We will
              communicate material changes with reasonable notice.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="serif legal-section-h2">3. Disclaimer</h2>
            <p className="legal-text">
              All content published on Know Your Commodity — including prices, forecasts, AI summaries, and market
              analysis — is provided for general informational purposes only. Nothing on this platform constitutes
              financial advice, investment recommendations, or a solicitation to buy or sell any commodity, financial
              instrument, or contract.
            </p>
            <p className="legal-text">
              Commodity markets are inherently volatile. Data may be delayed, approximate, or subject to revision.
              Users are solely responsible for their own trading and investment decisions. We strongly recommend
              verifying critical information through independent sources before acting on any data or analysis
              provided here.
            </p>
            <p className="legal-text">
              By accessing this platform, you acknowledge that you use all information entirely at your own risk.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="serif legal-section-h2">4. Data Protection &amp; Privacy</h2>
            <p className="legal-text">
              We collect the minimum information needed to operate the platform: name, email address, login and
              session data, contact messages, subscription status, and limited technical usage information. We comply
              with the General Data Protection Regulation (GDPR) and India&apos;s Digital Personal Data Protection
              Act (DPDP Act, 2023) to the extent applicable.
            </p>
            <p className="legal-text">
              We retain data only as long as needed for operations, security, billing, support, audit, or legal
              compliance. Depending on applicable law, you may have rights to access, correct, delete, restrict,
              object, or request portability of your data, and to withdraw consent for optional processing at any time.
            </p>
            <p className="legal-text">
              For privacy or data deletion requests, contact our Grievance Officer directly.
            </p>
            <div className="legal-grievance-card">
              <p className="legal-grievance-label">Grievance Officer</p>
              <p className="legal-grievance-name">Niraj Shah</p>
              <a href="mailto:grievance@kycagri.com" className="legal-link legal-grievance-email">
                grievance@kycagri.com
              </a>
            </div>
          </section>

          <section className="legal-section">
            <h2 className="serif legal-section-h2">5. Payments &amp; GST</h2>
            <p className="legal-text">
              All subscription prices displayed are inclusive of applicable taxes unless explicitly stated otherwise.
              Indian entities and individuals are subject to 18% GST as mandated by Indian tax law.
            </p>
            <ul className="legal-list">
              <li>GST invoices are issued by the 5th of the following month.</li>
              <li>For GST-registered businesses, provide your GSTIN at the time of subscription.</li>
              <li>
                Payments are processed through secure third-party gateways (Razorpay). We do not store full card
                or banking credentials.
              </li>
            </ul>
            <p className="legal-text">
              For billing queries or GST invoice requests, contact{' '}
              <a href="mailto:gst@kycagri.com" className="legal-link">gst@kycagri.com</a>. Include your payment
              reference and GSTIN.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="serif legal-section-h2">6. Refund Policy</h2>
            <p className="legal-text">
              All purchases are for digital services and access to online content. All sales are final. We do not
              provide refunds for subscription payments once access has been granted, except where required by
              applicable law.
            </p>
            <p className="legal-text">
              If you believe a charge was made in error or access was not delivered as described, contact{' '}
              <a href="mailto:billing@kycagri.com" className="legal-link">billing@kycagri.com</a> within 7 days of
              the transaction and we will review your case on its merits.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="serif legal-section-h2">7. Limitation of Liability</h2>
            <p className="legal-text">
              To the fullest extent permitted by applicable law, HnyB Tech Incubations Pvt. Ltd. and its officers,
              directors, employees, and agents shall not be liable for any direct, indirect, incidental, special,
              consequential, or punitive damages arising from your use of, or inability to use, the platform or its
              content.
            </p>
            <p className="legal-text">
              This includes losses resulting from reliance on commodity data, AI-generated forecasts or summaries,
              third-party information, service interruptions, data inaccuracies, or unauthorized access to user data.
            </p>
            <p className="legal-text">
              Our total aggregate liability for any claim shall not exceed the total subscription fees paid by you
              in the twelve (12) months preceding the claim.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="serif legal-section-h2">8. Governing Law</h2>
            <p className="legal-text">
              These Terms &amp; Conditions are governed by and construed in accordance with the laws of India. Any
              disputes shall be subject to the exclusive jurisdiction of the courts in Ahmedabad, Gujarat, India.
            </p>
            <p className="legal-text">
              If you access this platform from outside India, you do so at your own initiative and are responsible
              for compliance with local laws in your jurisdiction.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="serif legal-section-h2">9. Cookie Policy &amp; Tracking Disclosure</h2>
            <p className="legal-text">
              We use cookies and similar tracking technologies to operate core platform functions, maintain sign-in
              state, protect against abuse, support payment flow integrity, and remember your consent preferences.
            </p>

            <h3 className="legal-section-h3">Types of Cookies Used</h3>
            <div className="legal-cookie-table">
              <div className="legal-cookie-row">
                <strong>Essential Cookies</strong>
                <span>
                  Always active. Required for authentication, fraud prevention, secure session handling, checkout
                  continuity, and consent storage.
                </span>
              </div>
              <div className="legal-cookie-row">
                <strong>Preference Cookies</strong>
                <span>
                  Used only to remember user-facing settings (language, display preferences) where those features
                  exist.
                </span>
              </div>
              <div className="legal-cookie-row">
                <strong>Analytics Cookies</strong>
                <span>Reserved for service measurement and diagnostics. Only used after obtaining your consent.</span>
              </div>
              <div className="legal-cookie-row">
                <strong>Marketing Cookies</strong>
                <span>
                  Off by default. Reserved for advertising or retargeting technologies if deployed later and
                  consented to.
                </span>
              </div>
            </div>

            <h3 className="legal-section-h3">Third-Party Tracking</h3>
            <p className="legal-text">We may use third-party tools including:</p>
            <ul className="legal-list">
              <li>Google Analytics — traffic measurement and usage behavior (with consent)</li>
              <li>Razorpay — payment gateway trackers for transaction integrity and fraud prevention</li>
              <li>Performance monitoring tools for platform reliability diagnostics</li>
            </ul>
            <p className="legal-text">
              We do not currently deploy broad advertising pixels or front-end behavioral tracking scripts in the
              core app shell. We do not sell personal data.
            </p>

            <h3 className="legal-section-h3">Your Consent Choices</h3>
            <p className="legal-text">
              Cookies are used only after obtaining your consent where required by law. You can accept all cookies,
              decline non-essential cookies, or manage individual categories via our consent panel.
            </p>
            <div style={{ marginTop: 12 }}>
              <CookieSettingsButton className="btn btn-sm" label="Manage cookie settings" />
            </div>

            <h3 className="legal-section-h3">Managing Cookies in Your Browser</h3>
            <p className="legal-text">
              You may also control or disable cookies through your browser settings. Note that disabling essential
              cookies may prevent certain features from functioning — including login and payment flows.
            </p>

            <h3 className="legal-section-h3">How We Use Collected Data</h3>
            <ul className="legal-list">
              <li>Improving platform performance and stability</li>
              <li>Enhancing user experience and personalizing content</li>
              <li>Security, fraud prevention, and abuse detection</li>
              <li>Supporting compliance with legal obligations</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2 className="serif legal-section-h2">10. Contact</h2>
            <p className="legal-text">
              For questions, requests, or concerns related to these Terms, privacy, billing, or data handling,
              reach out using the appropriate contact below.
            </p>
            <div className="legal-contact-grid">
              <a href="mailto:billing@kycagri.com" className="legal-contact-card">
                <span className="legal-contact-type">Billing &amp; Subscriptions</span>
                <span className="legal-contact-email">billing@kycagri.com</span>
              </a>
              <a href="mailto:gst@kycagri.com" className="legal-contact-card">
                <span className="legal-contact-type">GST &amp; Tax Invoices</span>
                <span className="legal-contact-email">gst@kycagri.com</span>
              </a>
              <a href="mailto:grievance@kycagri.com" className="legal-contact-card">
                <span className="legal-contact-type">Grievance Officer</span>
                <span className="legal-contact-email">grievance@kycagri.com</span>
              </a>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
