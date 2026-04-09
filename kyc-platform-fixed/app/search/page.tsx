import type { Metadata } from 'next';
import SearchInterface from './SearchInterface';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessAISearch } from '@/lib/auth/entitlement';
export const metadata: Metadata = { title: 'Search' };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; premium?: string }> }) {
  const params = await searchParams;
  const session = await getServerSession();
  const canAI = canAccessAISearch(session);
  return <SearchInterface initialQuery={params.q || ''} canAISearch={canAI} />;
}
