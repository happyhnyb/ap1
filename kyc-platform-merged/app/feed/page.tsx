import type { Metadata } from 'next';
import { postsAdapter } from '@/lib/adapters';
import FeedInfinite from '@/components/feed/FeedInfinite';

export const metadata: Metadata = {
  title: 'Feed — Know Your Commodity',
  description: 'All articles, stories, and news briefs on agriculture, markets, and commodity prices.',
};

const PAGE_SIZE = 12;

export default async function FeedPage() {
  const { posts, total } = await postsAdapter.listPublishedPaged(1, PAGE_SIZE);
  const hasMore = total > PAGE_SIZE;

  return (
    <main>
      <div className="container" style={{ padding: '32px 0 20px' }}>
        <h1 className="serif" style={{ fontSize: 34, margin: '0 0 4px' }}>Feed</h1>
        <p style={{ color: 'var(--muted)', margin: '0 0 28px', fontSize: 15 }}>
          All articles, stories &amp; news briefs · sorted by latest
        </p>
      </div>
      <FeedInfinite initial={posts} initialHasMore={hasMore} initialTotal={total} />
    </main>
  );
}
