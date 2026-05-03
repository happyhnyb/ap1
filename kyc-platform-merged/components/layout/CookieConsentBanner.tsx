'use client';

import { useEffect, useState } from 'react';

type ConsentPreferences = {
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
};

const CONSENT_VERSION = '2026-05-03';
const STORAGE_KEY = 'kyc_cookie_consent';

const defaultPreferences: ConsentPreferences = {
  necessary: true,
  preferences: false,
  analytics: false,
  marketing: false,
  updatedAt: '',
};

function readStoredConsent(): ConsentPreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentPreferences & { version?: string };
    if (!parsed || parsed.version !== CONSENT_VERSION) return null;
    return {
      necessary: true,
      preferences: Boolean(parsed.preferences),
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return null;
  }
}

function persistConsent(preferences: ConsentPreferences) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...preferences,
      version: CONSENT_VERSION,
    }),
  );
}

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferences>(defaultPreferences);

  useEffect(() => {
    const stored = readStoredConsent();
    if (stored) {
      setPreferences(stored);
    } else {
      setVisible(true);
    }

    const handleOpen = () => {
      const latest = readStoredConsent();
      if (latest) {
        setPreferences(latest);
      }
      setVisible(true);
      setExpanded(true);
    };

    window.addEventListener('kyc:open-cookie-banner', handleOpen);
    return () => {
      window.removeEventListener('kyc:open-cookie-banner', handleOpen);
    };
  }, []);

  const saveAndClose = (next: ConsentPreferences) => {
    persistConsent(next);
    setPreferences(next);
    setVisible(false);
    setExpanded(false);
  };

  const timestamp = new Date().toISOString();

  const acceptAll = () =>
    saveAndClose({
      necessary: true,
      preferences: true,
      analytics: true,
      marketing: true,
      updatedAt: timestamp,
    });

  const essentialOnly = () =>
    saveAndClose({
      necessary: true,
      preferences: false,
      analytics: false,
      marketing: false,
      updatedAt: timestamp,
    });

  const saveCurrent = () =>
    saveAndClose({
      ...preferences,
      necessary: true,
      updatedAt: timestamp,
    });

  if (!visible) return null;

  return (
    <aside className="cookie-banner card-elevated" aria-live="polite" aria-label="Cookie consent">
      <div className="cookie-banner-top">
        <div>
          <p className="cookie-banner-kicker">Privacy choices</p>
          <h2 className="cookie-banner-title serif">Cookie consent and tracking disclosure</h2>
        </div>
        <button
          type="button"
          className="cookie-banner-link"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          {expanded ? 'Hide details' : 'Manage choices'}
        </button>
      </div>

      <p className="cookie-banner-copy">
        We use strictly necessary cookies for sign-in, security, session continuity, payment flow integrity, and storing your
        consent choices. Optional analytics, preference, or marketing technologies should only run if you allow them. At
        present, this site primarily relies on essential cookies and does not sell personal data.
      </p>

      {expanded ? (
        <div className="cookie-banner-panel">
          <div className="cookie-banner-grid">
            <div className="cookie-consent-item">
              <div>
                <div className="cookie-consent-head">
                  <strong>Strictly necessary</strong>
                  <span className="cookie-consent-chip cookie-consent-chip-on">Always active</span>
                </div>
                <p>Authentication, fraud prevention, secure session handling, checkout continuity, and consent storage.</p>
              </div>
            </div>

            <label className="cookie-consent-item cookie-consent-toggle">
              <div>
                <div className="cookie-consent-head">
                  <strong>Preferences</strong>
                </div>
                <p>Remember language, display, or experience settings if we introduce them.</p>
              </div>
              <input
                type="checkbox"
                checked={preferences.preferences}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    preferences: event.target.checked,
                  }))
                }
              />
            </label>

            <label className="cookie-consent-item cookie-consent-toggle">
              <div>
                <div className="cookie-consent-head">
                  <strong>Analytics</strong>
                  <span className="cookie-consent-chip">Currently limited</span>
                </div>
                <p>Measurement tools, performance diagnostics, and audience insights if enabled later.</p>
              </div>
              <input
                type="checkbox"
                checked={preferences.analytics}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    analytics: event.target.checked,
                  }))
                }
              />
            </label>

            <label className="cookie-consent-item cookie-consent-toggle">
              <div>
                <div className="cookie-consent-head">
                  <strong>Marketing</strong>
                  <span className="cookie-consent-chip">Off by default</span>
                </div>
                <p>Advertising, retargeting, and social media pixels only if we deploy them and you opt in.</p>
              </div>
              <input
                type="checkbox"
                checked={preferences.marketing}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    marketing: event.target.checked,
                  }))
                }
              />
            </label>
          </div>

          <p className="cookie-banner-meta">
            You can revisit this policy or reopen this panel from the footer. Consent version: {CONSENT_VERSION}.
          </p>
        </div>
      ) : null}

      <div className="cookie-banner-actions">
        <button type="button" className="btn btn-sm" onClick={essentialOnly}>
          Decline
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => window.dispatchEvent(new Event('kyc:open-legal-modal'))}
        >
          View Policy
        </button>
        {expanded ? (
          <button type="button" className="btn btn-sm" onClick={saveCurrent}>
            Save choices
          </button>
        ) : null}
        <button type="button" className="btn btn-primary btn-sm" onClick={acceptAll}>
          Accept all
        </button>
      </div>
    </aside>
  );
}
