import Link from 'next/link';
import type { Metadata } from 'next';
import { SuccessState } from './SuccessState';

export const metadata: Metadata = { title: 'Subscription Confirmed — KYC Pro' };

export default async function SubscribeSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="container" style={{ paddingTop: 80, paddingBottom: 80, textAlign: 'center' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ fontSize: 64, marginBottom: 24 }}>✓</div>
        <h1 className="serif" style={{ fontSize: 'clamp(28px,4vw,40px)', marginBottom: 16 }}>
          Welcome to KYC Pro
        </h1>
        <SuccessState provider={params.provider} />
        <p style={{ fontSize: 12, color: 'var(--dim)', marginTop: 32 }}>
          Payment confirmation and account access can depend on the payment provider configuration.
          Visit your <Link href="/subscribe" style={{ color: 'var(--gold)' }}>account page</Link> if your access has not updated yet.
        </p>
      </div>
    </main>
  );
}
