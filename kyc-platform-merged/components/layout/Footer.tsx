import Link from 'next/link';
import Image from 'next/image';
import { CookieSettingsButton } from '@/components/layout/CookieSettingsButton';
import { LegalPolicyTrigger } from '@/components/legal/LegalPolicyTrigger';

export function Footer({
  predictorPublic = false,
}: {
  predictorPublic?: boolean;
}) {
  const predictorHref = predictorPublic ? '/premium/predictor' : '/login?from=/premium/predictor';
  const platformLinks = [
    ['/', 'Feed'],
    ['/search', 'Search'],
    [predictorHref, 'Predictor'],
    ['/subscribe', 'Access'],
  ] as const;
  const companyLinks = [
    ['/about', 'About'],
    ['/contact', 'Contact'],
    ['/disclaimer', 'Methodology'],
  ] as const;
  const legalLinkLabels = ['Privacy policy', 'Terms & Conditions', 'Billing policy'] as const;

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="logo" style={{ marginBottom: 10 }}>
              <Image src="/logo.png" alt="KYC" width={36} height={36} style={{ borderRadius: '50%', filter: 'brightness(1.2)' }} />
              <span style={{ fontFamily: 'Lora,serif', fontWeight: 700, fontSize: 15 }}>Know Your Commodity</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.6, margin: 0 }}>
              Global commodity intelligence platform. Real data, deep analysis, actionable insights.
            </p>
          </div>

          <div className="footer-col">
            <div className="footer-heading">Platform</div>
            <div className="footer-links">
              {platformLinks.map(([href, label]) => (
                <Link key={href} href={href} className="footer-link">{label}</Link>
              ))}
            </div>
          </div>

          <div className="footer-col">
            <div className="footer-heading">Company</div>
            <div className="footer-links">
              {companyLinks.map(([href, label]) => (
                <Link key={href} href={href} className="footer-link">{label}</Link>
              ))}
            </div>
          </div>

          <div className="footer-col footer-col-legal">
            <div className="footer-heading">Privacy and legal</div>
            <div className="footer-links">
              {legalLinkLabels.map((label) => (
                <LegalPolicyTrigger key={label} className="footer-link">
                  {label}
                </LegalPolicyTrigger>
              ))}
              <CookieSettingsButton className="footer-privacy-button" />
            </div>
            <p className="footer-privacy-copy">
              Manage cookie consent, tracking choices, and policy disclosures from one place.
            </p>
          </div>
        </div>
        <div className="divider" />
        <div className="footer-bottom">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13 }}>
              © 2026 Know Your Commodity™ · All rights reserved · Powered by HnyB Tech Incubations Pvt. Ltd · CIN: U74999GJ2014PTC07936
            </span>
          </div>
          <a
            className="unwind-badge unwind-badge-link"
            href="https://un-wind.ai"
            target="_blank"
            rel="noreferrer"
          >
            Powered by Unwind AI
          </a>
        </div>
      </div>
    </footer>
  );
}
