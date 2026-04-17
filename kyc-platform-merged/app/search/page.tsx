import type { Metadata } from 'next';
import SearchInterface from './SearchInterface';
import { getEffectiveServerSession } from '@/lib/auth/current-user';
import { canAccessAISearch } from '@/lib/auth/entitlement';
export const metadata: Metadata = {
  title: 'Search',
  description: 'Search KYC coverage, source-backed articles, commodity explainers, and market research.',
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; premium?: string }> }) {
  const params = await searchParams;
  const session = await getEffectiveServerSession();
  const canAI = canAccessAISearch(session);
  return <SearchInterface initialQuery={params.q || ''} canAISearch={canAI} />;
}
