import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Article } from '@/components/post/Article';
import { getPost } from '@/lib/api';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPost, isPremium } from '@/lib/auth/entitlement';
import { postsAdapter } from '@/lib/adapters';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  return { title: post.title, description: post.excerpt };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post || post.status !== 'published') notFound();

  // Increment view count (fire-and-forget)
  postsAdapter.incrementViews(slug).catch(() => {});

  const session = await getServerSession();
  const canRead = canAccessPost(session, post.is_premium);

  // Fetch linked premium article if this story has one
  let linkedArticle = null;
  if (isPremium(session) && post.linked_article_id) {
    linkedArticle = await postsAdapter.getBySlug(post.linked_article_id).catch(() => null);
  }

  return <Article post={post} canRead={canRead} linkedArticle={linkedArticle} />;
}
