import type { Metadata } from 'next';
import Feed from '@/components/feed/Feed';
import { postsAdapter } from '@/lib/adapters';
import { getPostsSnapshot } from '@/lib/fallback/posts-snapshot';

export const metadata: Metadata = {
  title: 'Know Your Commodity — Agriculture & Commodity Analysis',
  description: 'Editorial coverage, market analysis, and commodity intelligence for agriculture, trade, and policy readers.',
};

export const revalidate = 300;

function isNetlifyRuntime() {
  const env = globalThis.process?.env ?? {};
  return Boolean(env.NETLIFY || env.DEPLOY_ID || env.SITE_ID || env.URL?.includes('netlify.app'));
}

export default async function HomePage() {
  const posts = await (isNetlifyRuntime() ? Promise.resolve(getPostsSnapshot()) : postsAdapter.listPublished()).catch((error) => {
    console.error('[app/page] Failed to load published posts for homepage.', error);
    return [];
  });

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
