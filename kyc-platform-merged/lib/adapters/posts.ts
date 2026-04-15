/**
 * Posts adapter — uses MongoDB when MONGODB_URI is configured,
 * falls back to in-memory store for local dev without a DB.
 */
import type { Post } from '@/types/post';
import { INITIAL_POSTS } from '@/mocks/data';
import { generateId, generateSlug } from '@/lib/utils';
import { isMongoConfigured, connectDB } from '@/lib/db/connect';
import { PostModel } from '@/lib/db/models/Post';

// ── In-memory fallback ───────────────────────────────────────────
let memoryPosts = [...INITIAL_POSTS];

export interface CreatePostInput {
  title: string;
  excerpt: string;
  body: string;
  category: string;
  type: Post['type'];
  tags: string[];
  is_premium: boolean;
  linked_article_id?: string | null;
  hero_image?: string | null;
  author: string;
  author_id: string;
  status?: Post['status'];
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
    inline_images:    (doc.inline_images as string[]) || [],
  };
}

function postDedupeKey(post: Post) {
  return (post.slug || post.title).toLowerCase().replace(/\s+/g, ' ').trim();
}

function dedupePosts(posts: Post[]) {
  const seen = new Set<string>();
  const unique: Post[] = [];
  for (const post of posts) {
    const key = postDedupeKey(post);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(post);
  }
  return unique;
}

// ── Mongo implementation ─────────────────────────────────────────
const mongo = {
  async listPublished() {
    await connectDB();
    const docs = await PostModel.find({ status: 'published' }).sort({ published_at: -1 }).lean();
    return dedupePosts(docs.map((d) => toPost(d as unknown as Record<string, unknown>)));
  },
  async listPublishedPaged(page: number, limit: number, type?: string) {
    await connectDB();
    const skip = (page - 1) * limit;
    const query: Record<string, unknown> = { status: 'published' };
    if (type) query.type = type;
    const [docs, total] = await Promise.all([
      PostModel.find(query).sort({ published_at: -1 }).skip(skip).limit(limit).lean(),
      PostModel.countDocuments(query),
    ]);
    const posts = dedupePosts(docs.map((d) => toPost(d as unknown as Record<string, unknown>)));
    return { posts, total: Math.max(posts.length, total) };
  },
  async listAll() {
    await connectDB();
    const docs = await PostModel.find().sort({ updated_at: -1 }).lean();
    return dedupePosts(docs.map((d) => toPost(d as unknown as Record<string, unknown>)));
  },
  async getBySlug(slug: string) {
    await connectDB();
    const doc = await PostModel.findOne({ slug }).lean();
    return doc ? toPost(doc as unknown as Record<string, unknown>) : null;
  },
  async search(query: string) {
    await connectDB();
    const docs = await PostModel.find(
      { status: 'published', $text: { $search: query } },
      { score: { $meta: 'textScore' } }
    ).sort({ score: { $meta: 'textScore' } }).lean();
    return dedupePosts(docs.map((d) => toPost(d as unknown as Record<string, unknown>)));
  },
  async incrementViews(slug: string) {
    await connectDB();
    await PostModel.updateOne({ slug }, { $inc: { view_count: 1 } });
  },
  async create(input: CreatePostInput) {
    await connectDB();
    const now = new Date();
    const doc = await PostModel.create({
      type:             input.type,
      title:            input.title,
      slug:             generateSlug(input.title),
      excerpt:          input.excerpt,
      body:             input.body,
      category:         input.category,
      tags:             input.tags,
      is_premium:       input.is_premium,
      linked_article_id:input.linked_article_id ?? null,
      author:           input.author,
      author_id:        input.author_id,
      status:           input.status ?? 'draft',
      published_at:     input.status === 'published' ? now : null,
      img:              'crops',
      hero_image:       input.hero_image ?? null,
    });
    return toPost(doc.toObject() as unknown as Record<string, unknown>);
  },
  async update(slug: string, patch: Partial<CreatePostInput> & { status?: Post['status'] }) {
    await connectDB();
    const update: Record<string, unknown> = { ...patch, updated_at: new Date() };
    if (patch.status === 'published') update.published_at = new Date();
    const doc = await PostModel.findOneAndUpdate({ slug }, update, { new: true }).lean();
    return doc ? toPost(doc as unknown as Record<string, unknown>) : null;
  },
};

async function withPostFallback<T>(operation: string, fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[postsAdapter:${operation}] falling back to in-memory data`, error);
    return fallback();
  }
}

// ── Memory implementation ────────────────────────────────────────
const memory = {
  async listPublished() {
    return dedupePosts(memoryPosts.filter((p) => p.status === 'published').sort((a, b) => (b.published_at || '').localeCompare(a.published_at || '')));
  },
  async listPublishedPaged(page: number, limit: number, type?: string) {
    let filtered = memoryPosts.filter((p) => p.status === 'published');
    if (type) filtered = filtered.filter((p) => p.type === type);
    filtered.sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));
    filtered = dedupePosts(filtered);
    const start = (page - 1) * limit;
    return { posts: filtered.slice(start, start + limit), total: filtered.length };
  },
  async listAll() {
    return dedupePosts([...memoryPosts].sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
  },
  async getBySlug(slug: string) {
    return memoryPosts.find((p) => p.slug === slug) ?? null;
  },
  async search(query: string) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return dedupePosts(memoryPosts.filter((p) => {
      if (p.status !== 'published') return false;
      const haystack = [p.title, p.excerpt, p.body, ...p.tags].join(' ').toLowerCase();
      return terms.every((t) => haystack.includes(t));
    }));
  },
  async incrementViews(slug: string) {
    memoryPosts = memoryPosts.map((p) => p.slug === slug ? { ...p, view_count: p.view_count + 1 } : p);
  },
  async create(input: CreatePostInput) {
    const now = new Date().toISOString();
    const post: Post = {
      _id: generateId('p'),
      title: input.title,
      slug: generateSlug(input.title),
      excerpt: input.excerpt,
      body: input.body,
      category: input.category,
      type: input.type,
      tags: input.tags,
      is_premium: input.is_premium,
      linked_article_id: input.linked_article_id ?? null,
      author: input.author,
      author_id: input.author_id,
      status: input.status ?? 'draft',
      published_at: input.status === 'published' ? now : null,
      created_at: now,
      updated_at: now,
      view_count: 0,
      img: 'crops',
      hero_image: input.hero_image ?? null,
      inline_images: [],
    };
    memoryPosts = [post, ...memoryPosts];
    return post;
  },
  async update(slug: string, patch: Partial<CreatePostInput> & { status?: Post['status'] }) {
    const now = new Date().toISOString();
    memoryPosts = memoryPosts.map((p) => {
      if (p.slug !== slug) return p;
      return {
        ...p,
        ...patch,
        updated_at: now,
        published_at: patch.status === 'published' && !p.published_at ? now : p.published_at,
      } as Post;
    });
    return memoryPosts.find((p) => p.slug === slug) ?? null;
  },
};

// ── Export ───────────────────────────────────────────────────────
export const postsAdapter = isMongoConfigured()
  ? {
      listPublished: (...args: Parameters<typeof mongo.listPublished>) =>
        withPostFallback('listPublished', () => mongo.listPublished(...args), () => memory.listPublished()),
      listPublishedPaged: (...args: Parameters<typeof mongo.listPublishedPaged>) =>
        withPostFallback('listPublishedPaged', () => mongo.listPublishedPaged(...args), () => memory.listPublishedPaged(...args)),
      listAll: (...args: Parameters<typeof mongo.listAll>) =>
        withPostFallback('listAll', () => mongo.listAll(...args), () => memory.listAll()),
      getBySlug: (...args: Parameters<typeof mongo.getBySlug>) =>
        withPostFallback('getBySlug', () => mongo.getBySlug(...args), () => memory.getBySlug(...args)),
      search: (...args: Parameters<typeof mongo.search>) =>
        withPostFallback('search', () => mongo.search(...args), () => memory.search(...args)),
      incrementViews: (...args: Parameters<typeof mongo.incrementViews>) =>
        withPostFallback('incrementViews', () => mongo.incrementViews(...args), () => memory.incrementViews(...args)),
      create: (...args: Parameters<typeof mongo.create>) =>
        withPostFallback('create', () => mongo.create(...args), () => memory.create(...args)),
      update: (...args: Parameters<typeof mongo.update>) =>
        withPostFallback('update', () => mongo.update(...args), () => memory.update(...args)),
    }
  : memory;
