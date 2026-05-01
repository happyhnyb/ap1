import type { Post } from '@/types/post';
import { env } from '@/lib/env';
import { getPostsSnapshot } from '@/lib/fallback/posts-snapshot';

export type HexoPostSource = 'mac-mini' | 'snapshot';

export async function loadPostsForHexo(): Promise<{ posts: Post[]; source: HexoPostSource }> {
  if (env.MAC_MINI_API_BASE_URL) {
    const headers = new Headers({ Accept: 'application/json' });
    if (env.INTERNAL_API_KEY) {
      headers.set('x-internal-api-key', env.INTERNAL_API_KEY);
    }

    try {
      const response = await fetch(`${env.MAC_MINI_API_BASE_URL.replace(/\/$/, '')}/api/internal/posts`, {
        headers,
        cache: 'no-store',
      });

      if (response.ok) {
        const posts = await response.json() as Post[];
        if (Array.isArray(posts) && posts.length) {
          return { posts, source: 'mac-mini' };
        }
      }
    } catch (error) {
      console.warn('[hexo] Failed to pull posts from Mac mini, using bundled snapshot.', error);
    }
  }

  return {
    posts: getPostsSnapshot(),
    source: 'snapshot',
  };
}
