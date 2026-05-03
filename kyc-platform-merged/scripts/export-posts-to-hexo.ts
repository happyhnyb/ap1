import fs from 'fs/promises';
import path from 'path';
import { loadPostsForHexo } from '@/lib/hexo/posts';
import type { Post } from '@/types/post';

const HEXO_BASE_DIR = path.resolve(process.cwd(), 'hexo-site');
const HEXO_POSTS_DIR = path.join(HEXO_BASE_DIR, 'source', '_posts');

function serializeScalar(value: string | number | boolean | null) {
  return JSON.stringify(value);
}

function toFrontMatter(post: Post) {
  return [
    '---',
    `title: ${serializeScalar(post.title)}`,
    `date: ${serializeScalar(post.published_at ?? post.created_at)}`,
    `updated: ${serializeScalar(post.updated_at)}`,
    `slug: ${serializeScalar(post.slug)}`,
    `layout: ${serializeScalar('post')}`,
    `type: ${serializeScalar(post.type)}`,
    `excerpt: ${serializeScalar(post.excerpt)}`,
    `author: ${serializeScalar(post.author)}`,
    `author_id: ${serializeScalar(post.author_id)}`,
    `category: ${serializeScalar(post.category)}`,
    `tags: ${JSON.stringify(post.tags ?? [])}`,
    `is_premium: ${serializeScalar(post.is_premium)}`,
    `linked_article_id: ${serializeScalar(post.linked_article_id)}`,
    `status: ${serializeScalar(post.status)}`,
    `view_count: ${serializeScalar(post.view_count)}`,
    `img: ${serializeScalar(post.img)}`,
    `hero_image: ${serializeScalar(post.hero_image)}`,
    '---',
    '',
  ].join('\n');
}

function sanitizeFileName(post: Post) {
  return `${post.slug || post._id}.md`.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-');
}

async function ensureWorkspace() {
  await fs.mkdir(path.join(HEXO_BASE_DIR, 'source'), { recursive: true });
  await fs.mkdir(path.join(HEXO_BASE_DIR, 'public'), { recursive: true });
  await fs.rm(HEXO_POSTS_DIR, { recursive: true, force: true });
  await fs.mkdir(HEXO_POSTS_DIR, { recursive: true });
}

async function writePost(post: Post) {
  const filePath = path.join(HEXO_POSTS_DIR, sanitizeFileName(post));
  const content = `${toFrontMatter(post)}${post.body.trim()}\n`;
  await fs.writeFile(filePath, content, 'utf8');
}

async function main() {
  const { posts, source } = await loadPostsForHexo();
  await ensureWorkspace();

  for (const post of posts) {
    await writePost(post);
  }

  console.log(`Exported ${posts.length} posts to ${HEXO_POSTS_DIR} from ${source}.`);
}

main().catch((error) => {
  console.error('[export-posts-to-hexo] Failed.', error);
  process.exit(1);
});
