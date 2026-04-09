/**
 * Standard search — MongoDB $text index search with snippet highlighting.
 * Falls back to in-memory adapter search when Mongo is not configured.
 */
import { postsAdapter } from '@/lib/adapters/posts';
import { isMongoConfigured, connectDB } from '@/lib/db/connect';
import { PostModel } from '@/lib/db/models/Post';
import type { Post } from '@/types/post';

export interface SearchResult {
  post: Post;
  snippet: string;
  score: number;
}

function buildSnippet(body: string, query: string, maxLen = 200): string {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const idx = terms.reduce((best, term) => {
    const i = body.toLowerCase().indexOf(term);
    return i !== -1 && (best === -1 || i < best) ? i : best;
  }, -1);
  if (idx === -1) return body.slice(0, maxLen) + (body.length > maxLen ? '…' : '');
  const start = Math.max(0, idx - 60);
  const end = Math.min(body.length, idx + maxLen - 60);
  return (start > 0 ? '…' : '') + body.slice(start, end) + (end < body.length ? '…' : '');
}

function toPost(doc: Record<string, unknown>): Post {
  return {
    _id:              String(doc._id),
    type:             doc.type as Post['type'],
    title:            doc.title as string,
    slug:             doc.slug as string,
    excerpt:          doc.excerpt as string,
    body:             doc.body as string,
    author:           doc.author as string,
    author_id:        doc.author_id as string,
    tags:             (doc.tags as string[]) || [],
    category:         doc.category as string,
    is_premium:       Boolean(doc.is_premium),
    linked_article_id:(doc.linked_article_id as string | null) ?? null,
    status:           doc.status as Post['status'],
    published_at:     doc.published_at ? new Date(doc.published_at as string).toISOString() : null,
    created_at:       new Date(doc.created_at as string).toISOString(),
    updated_at:       new Date(doc.updated_at as string).toISOString(),
    view_count:       Number(doc.view_count ?? 0),
    img:              (doc.img as string) || 'crops',
    hero_image:       (doc.hero_image as string | null) ?? null,
  };
}

export async function standardSearch(
  query: string,
  opts: {
    type?: string;
    is_premium?: 'true' | 'false' | '';
    from?: string;
    to?: string;
  } = {}
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  if (isMongoConfigured()) {
    await connectDB();

    const filter: Record<string, unknown> = {
      status: 'published',
      $text:  { $search: query },
    };
    if (opts.type) filter.type = opts.type.toUpperCase();
    if (opts.is_premium === 'true')  filter.is_premium = true;
    if (opts.is_premium === 'false') filter.is_premium = false;
    if (opts.from || opts.to) {
      const date: Record<string, Date> = {};
      if (opts.from) date.$gte = new Date(opts.from);
      if (opts.to)   date.$lte = new Date(opts.to);
      filter.published_at = date;
    }

    const docs = await PostModel.find(
      filter,
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' }, published_at: -1 })
      .limit(30)
      .lean();

    return docs.map((doc) => ({
      post:    toPost(doc as unknown as Record<string, unknown>),
      snippet: buildSnippet(((doc as unknown as Record<string, unknown>).body as string) || '', query),
      score:   ((doc as unknown as Record<string, unknown>).score as number) || 1,
    }));
  }

  // Fallback: in-memory
  const posts = await postsAdapter.search(query);
  return posts
    .filter((p) => {
      if (opts.type && p.type !== opts.type.toUpperCase()) return false;
      if (opts.is_premium === 'true' && !p.is_premium) return false;
      if (opts.is_premium === 'false' && p.is_premium) return false;
      return true;
    })
    .map((post) => ({
      post,
      snippet: buildSnippet(post.body, query),
      score: 1,
    }));
}
