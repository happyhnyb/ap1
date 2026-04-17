import Link from 'next/link';
import type { Metadata } from 'next';
import { SuccessState } from './SuccessState';
import { env } from '@/lib/env';

export const metadata: Metadata = { title: 'Access Status' };

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
          Access status
        </h1>
        <SuccessState provider={params.provider} billingEnabled={env.PAYMENTS_ENABLED} />
        <p style={{ fontSize: 12, color: 'var(--dim)', marginTop: 32 }}>
          Visit the <Link href="/subscribe" style={{ color: 'var(--gold)' }}>access page</Link> for the latest rollout status and contact details.
        </p>
      </div>
    </main>
  );
}
