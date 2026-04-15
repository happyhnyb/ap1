import type { Metadata } from 'next';
import Feed from '@/components/feed/Feed';
import { postsAdapter } from '@/lib/adapters';

export const metadata: Metadata = {
  title: 'Know Your Commodity — Agriculture & Commodity Analysis',
  description: 'Editorial coverage, market analysis, and commodity intelligence for agriculture, trade, and policy readers.',
};

export const revalidate = 300;

export default async function HomePage() {
  const posts = await postsAdapter.listPublished();

  return (
    <>
      <section className="container blog-masthead">
        <p className="blog-kicker">Know Your Commodity</p>
        <h1 className="serif blog-title">Agriculture &amp; Commodity Analysis</h1>
        <p className="blog-subtitle">
          Independent coverage on crop markets, trade flows, policy shifts, and
          commodity signals.
        </p>
      </section>
      <Feed posts={posts} />
    </>
  );
}
