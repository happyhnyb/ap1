import fs from 'fs/promises';
import path from 'path';
import { env } from '@/lib/env';
import { getPostsSnapshot } from '@/lib/fallback/posts-snapshot';
import type { Post } from '@/types/post';

async function fetchLivePosts(): Promise<Post[] | null> {
  if (!env.MAC_MINI_API_BASE_URL) return null;

  const headers = new Headers({ Accept: 'application/json' });
  if (env.INTERNAL_API_KEY) {
    headers.set('x-internal-api-key', env.INTERNAL_API_KEY);
  }

  const response = await fetch(`${env.MAC_MINI_API_BASE_URL.replace(/\/$/, '')}/api/internal/posts`, {
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Live snapshot fetch failed with status ${response.status}.`);
  }

  return await response.json() as Post[];
}

async function main() {
  const snapshotPath = path.resolve(process.cwd(), 'data/fallback/posts-snapshot.json');
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });

  let posts = getPostsSnapshot();
  let source = 'bundled-fallback';

  try {
    const livePosts = await fetchLivePosts();
    if (livePosts?.length) {
      posts = livePosts;
      source = 'mac-mini';
    }
  } catch (error) {
    console.warn('[generate-posts-snapshot] Live fetch failed, keeping bundled fallback snapshot.', error);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source,
    count: posts.length,
    posts,
  };

  await fs.writeFile(snapshotPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Saved ${posts.length} posts to ${snapshotPath} from ${source}.`);
}

main().catch((error) => {
  console.error('[generate-posts-snapshot] Failed to generate posts snapshot.', error);
  process.exit(1);
});
