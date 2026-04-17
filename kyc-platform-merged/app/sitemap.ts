import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { postsAdapter } from '@/lib/adapters';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = env.BASE_URL;
  const staticRoutes: MetadataRoute.Sitemap = [
    '',
    '/feed',
    '/about',
    '/contact',
    '/search',
    '/premium/predictor',
    '/subscribe',
    '/privacy',
    '/terms',
    '/disclaimer',
    '/billing-policy',
  ].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
  }));

  try {
    const posts = await postsAdapter.listPublished();
    return [
      ...staticRoutes,
      ...posts.map((post) => ({
        url: `${baseUrl}/post/${post.slug}`,
        lastModified: new Date(post.updated_at || post.published_at || post.created_at),
      })),
    ];
  } catch (error) {
    console.error('[sitemap] failed to load posts', error);
    return staticRoutes;
  }
}
