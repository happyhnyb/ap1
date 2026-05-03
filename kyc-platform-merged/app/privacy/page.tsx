import type { Metadata } from 'next';
import { CookiePolicyContent } from './CookiePolicyContent';

export const metadata: Metadata = {
  title: 'Privacy Policy and Cookie Disclosure',
  description: 'Privacy policy, cookie consent disclosure, and tracking transparency for Know Your Commodity and KYC Agri.',
};

export default function PrivacyPage() {
  return (
    <main className="container section">
      <CookiePolicyContent />
    </main>
  );
}
