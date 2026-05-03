import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Article } from '@/components/post/Article';
import { getPost } from '@/lib/api';
import { getEffectiveServerSession } from '@/lib/auth/current-user';
import { canAccessPost, isEditor, isPremium } from '@/lib/auth/entitlement';
import { postsAdapter } from '@/lib/adapters';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  const session = await getEffectiveServerSession();
  if (!post || (post.status !== 'published' && !isEditor(session))) return {};
  return {
    title: post.seo_title || post.title,
    description: post.seo_description || post.excerpt,
  };
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  const session = await getEffectiveServerSession();
  const canPreviewUnpublished = isEditor(session);
  if (!post || (post.status !== 'published' && !canPreviewUnpublished)) notFound();

  const canRead = canAccessPost(session, post.is_premium);
  const isPublished = post.status === 'published';

  if (isPublished) {
    // Increment view count (fire-and-forget) only for public posts.
    postsAdapter.incrementViews(slug).catch(() => {});
  }

  // Fetch linked premium article if this story has one
  let linkedArticle = null;
  if (isPremium(session) && post.linked_article_id) {
    linkedArticle = await postsAdapter.getBySlug(post.linked_article_id).catch(() => null);
  }

  return <Article post={post} canRead={canRead} linkedArticle={linkedArticle} hasPremiumAI={isPremium(session)} />;
}
