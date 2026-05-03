import fs from 'fs/promises';
import path from 'path';
import type { Post } from '@/types/post';

const Hexo = require('hexo');

const HEXO_BASE_DIR = path.resolve(process.cwd(), 'hexo-site');
const HEXO_PUBLIC_DIR = path.join(HEXO_BASE_DIR, 'public');
const FALLBACK_SNAPSHOT_PATH = path.resolve(process.cwd(), 'data', 'fallback', 'posts-snapshot.json');

function deriveExcerpt(body: string) {
  return body.replace(/\s+/g, ' ').trim().slice(0, 220);
}

function serializeHexoPost(post: any): Post {
  const tags = typeof post.tags?.toArray === 'function'
    ? post.tags.toArray().map((tag: any) => tag.name)
    : Array.isArray(post.tags)
      ? post.tags
      : [];
  const categories = typeof post.categories?.toArray === 'function'
    ? post.categories.toArray().map((category: any) => category.name)
    : Array.isArray(post.categories)
      ? post.categories
      : [];
  const body = typeof post._content === 'string'
    ? post._content.trim()
    : typeof post.content === 'string'
      ? post.content.trim()
      : '';

  return {
    _id: String(post._id),
    type: post.type === 'SHORT' || post.type === 'STORY' || post.type === 'ARTICLE' ? post.type : 'ARTICLE',
    title: post.title || post.slug || 'Untitled',
    slug: post.slug,
    excerpt: typeof post.excerpt === 'string' && post.excerpt.trim() ? post.excerpt.trim() : deriveExcerpt(body),
    body,
    author: typeof post.author === 'string' && post.author.trim() ? post.author : 'KYC Desk',
    author_id: typeof post.author_id === 'string' && post.author_id.trim() ? post.author_id : 'hexo',
    tags,
    category: categories[0] || post.category || 'Trade Talk',
    is_premium: Boolean(post.is_premium),
    linked_article_id: typeof post.linked_article_id === 'string' ? post.linked_article_id : null,
    status: post.status === 'draft' || post.status === 'archived' || post.status === 'published' ? post.status : 'published',
    published_at: post.date ? new Date(post.date).toISOString() : null,
    created_at: post.date ? new Date(post.date).toISOString() : new Date().toISOString(),
    updated_at: post.updated ? new Date(post.updated).toISOString() : (post.date ? new Date(post.date).toISOString() : new Date().toISOString()),
    view_count: Number(post.view_count ?? 0),
    img: typeof post.img === 'string' && post.img.trim() ? post.img : 'crops',
    hero_image: typeof post.hero_image === 'string' && post.hero_image.trim() ? post.hero_image : null,
    inline_images: [],
  };
}

async function main() {
  const hexo = new Hexo(HEXO_BASE_DIR, { silent: true });
  await hexo.init();
  await hexo.loadPlugin(require.resolve('hexo-renderer-marked'));

  hexo.extend.generator.register('kyc-json-snapshot', function(locals: any) {
    const posts = locals.posts.toArray().map(serializeHexoPost).sort((left: Post, right: Post) => {
      const leftTime = new Date(left.published_at || left.created_at).getTime();
      const rightTime = new Date(right.published_at || right.created_at).getTime();
      return rightTime - leftTime;
    });

    const generatedAt = new Date().toISOString();
    const listPayload = {
      generatedAt,
      source: 'hexo',
      count: posts.length,
      posts,
    };

    return [
      {
        path: 'api/posts.json',
        data: JSON.stringify(listPayload, null, 2),
        layout: false,
      },
      ...posts.map((post: Post) => ({
        path: `api/posts/${post.slug}.json`,
        data: JSON.stringify({ generatedAt, post }, null, 2),
        layout: false,
      })),
    ];
  });

  await hexo.call('generate', { force: true });

  const output = await fs.readFile(path.join(HEXO_PUBLIC_DIR, 'api', 'posts.json'), 'utf8');
  await fs.mkdir(path.dirname(FALLBACK_SNAPSHOT_PATH), { recursive: true });
  await fs.writeFile(FALLBACK_SNAPSHOT_PATH, `${output.trim()}\n`, 'utf8');

  console.log(`Generated Hexo fallback snapshot at ${FALLBACK_SNAPSHOT_PATH}.`);
}

main().catch((error: unknown) => {
  console.error('[generate-hexo-fallback] Failed.', error);
  process.exit(1);
});
