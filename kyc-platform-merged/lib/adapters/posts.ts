import 'server-only';

import type { Post } from '@/types/post';
import { env } from '@/lib/env';
import { connectDB, isMongoConfigured } from '@/lib/db/connect';
import { PostModel } from '@/lib/db/models/Post';
import {
  getPagedPostsSnapshot,
  getPostFromSnapshot,
  getPostsSnapshot,
  searchPostsSnapshot,
} from '@/lib/fallback/posts-snapshot';
import {
  createArticle,
  deleteArticleById,
  getArticleBySlug,
  incrementArticleViews,
  listAllArticles,
  listPublishedArticles,
  listPublishedArticlesPaged,
  publishArticleById,
  searchArticles,
  type ArticleInput,
  updateArticleBySlug,
} from '@/lib/db/repositories/articles';
import { generateSlug } from '@/lib/utils';

export interface CreatePostInput extends ArticleInput {}

function getBackendBaseUrl() {
  return env.MAC_MINI_API_BASE_URL.replace(/\/$/, '');
}

async function runSnapshotFallback<T>(reason: unknown, loader: () => T | Promise<T>, label: string): Promise<T> {
  console.warn(`[postsAdapter] Falling back to bundled posts snapshot for ${label}.`, reason);
  return await loader();
}

async function proxyJson<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    throw new Error('No local database or Mac Mini backend is configured.');
  }

  const headers = new Headers(init?.headers);
  if (env.INTERNAL_API_KEY) {
    headers.set('x-internal-api-key', env.INTERNAL_API_KEY);
  }
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await res.json().catch(() => null) as { error?: string } & T | null;
    if (!res.ok) {
      throw new Error(payload?.error || `Mac Mini article request failed (${res.status}).`);
    }
    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

function toPost(doc: Record<string, unknown>): Post {
  return {
    _id: String(doc._id),
    type: doc.type as Post['type'],
    title: doc.title as string,
    slug: doc.slug as string,
    excerpt: doc.excerpt as string,
    body: doc.body as string,
    author: doc.author as string,
    author_id: doc.author_id as string,
    tags: (doc.tags as string[]) || [],
    category: doc.category as string,
    is_premium: Boolean(doc.is_premium),
    linked_article_id: (doc.linked_article_id as string | null) ?? null,
    status: doc.status as Post['status'],
    published_at: doc.published_at ? new Date(doc.published_at as string).toISOString() : null,
    created_at: new Date(doc.created_at as string).toISOString(),
    updated_at: new Date(doc.updated_at as string).toISOString(),
    view_count: Number(doc.view_count ?? 0),
    img: (doc.img as string) || 'crops',
    hero_image: (doc.hero_image as string | null) ?? null,
    inline_images: (doc.inline_images as string[]) || [],
  };
}

async function mongoListPublished() {
  await connectDB();
  const docs = await PostModel.find({ status: 'published' }).sort({ published_at: -1 }).lean();
  return docs.map((doc) => toPost(doc as unknown as Record<string, unknown>));
}

async function mongoListPublishedPaged(page: number, limit: number, type?: string) {
  await connectDB();
  const skip = (page - 1) * limit;
  const query: Record<string, unknown> = { status: 'published' };
  if (type) query.type = type;
  const [docs, total] = await Promise.all([
    PostModel.find(query).sort({ published_at: -1 }).skip(skip).limit(limit).lean(),
    PostModel.countDocuments(query),
  ]);
  return {
    posts: docs.map((doc) => toPost(doc as unknown as Record<string, unknown>)),
    total,
  };
}

async function mongoListAll() {
  await connectDB();
  const docs = await PostModel.find().sort({ updated_at: -1 }).lean();
  return docs.map((doc) => toPost(doc as unknown as Record<string, unknown>));
}

async function mongoGetBySlug(slug: string) {
  await connectDB();
  const doc = await PostModel.findOne({ slug }).lean();
  return doc ? toPost(doc as unknown as Record<string, unknown>) : null;
}

async function mongoSearch(query: string) {
  await connectDB();
  const docs = await PostModel.find(
    { status: 'published', $text: { $search: query } },
    { score: { $meta: 'textScore' } }
  ).sort({ score: { $meta: 'textScore' } }).lean();
  return docs.map((doc) => toPost(doc as unknown as Record<string, unknown>));
}

async function mongoIncrementViews(slug: string) {
  await connectDB();
  await PostModel.updateOne({ slug }, { $inc: { view_count: 1 } });
}

async function mongoCreate(input: CreatePostInput) {
  await connectDB();
  const now = new Date();
  const doc = await PostModel.create({
    type: input.type,
    title: input.title,
    slug: generateSlug(input.title),
    excerpt: input.excerpt,
    body: input.body,
    category: input.category,
    tags: input.tags,
    is_premium: input.is_premium,
    linked_article_id: input.linked_article_id ?? null,
    author: input.author,
    author_id: input.author_id,
    status: input.status ?? 'draft',
    published_at: input.status === 'published' ? now : null,
    img: 'crops',
    hero_image: input.hero_image ?? null,
  });
  return toPost(doc.toObject() as unknown as Record<string, unknown>);
}

async function mongoUpdate(slug: string, patch: Partial<CreatePostInput> & { status?: Post['status'] }) {
  await connectDB();
  const update: Record<string, unknown> = { ...patch, updated_at: new Date() };
  if (patch.title) update.slug = generateSlug(patch.title);
  if (patch.status === 'published') update.published_at = new Date();
  const doc = await PostModel.findOneAndUpdate({ slug }, update, { new: true }).lean();
  return doc ? toPost(doc as unknown as Record<string, unknown>) : null;
}

async function mongoDeleteById(id: string) {
  await connectDB();
  await PostModel.deleteOne({ _id: id });
}

async function mongoPublishById(id: string) {
  await connectDB();
  const doc = await PostModel.findByIdAndUpdate(
    id,
    { status: 'published', published_at: new Date(), updated_at: new Date() },
    { new: true }
  ).lean();
  return doc ? toPost(doc as unknown as Record<string, unknown>) : null;
}

export const postsAdapter = {
  async listPublished(): Promise<Post[]> {
    if (env.DATABASE_URL) return listPublishedArticles();
    if (isMongoConfigured()) return mongoListPublished();
    try {
      return await proxyJson<Post[]>('/api/internal/posts');
    } catch (error) {
      return runSnapshotFallback(error, () => getPostsSnapshot(), 'listPublished');
    }
  },

  async listPublishedPaged(page: number, limit: number, type?: string) {
    if (env.DATABASE_URL) return listPublishedArticlesPaged(page, limit, type);
    if (isMongoConfigured()) return mongoListPublishedPaged(page, limit, type);
    const query = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(type ? { type } : {}),
    }).toString();
    try {
      return await proxyJson<{ posts: Post[]; total: number }>(`/api/internal/posts?${query}`);
    } catch (error) {
      return runSnapshotFallback(error, () => getPagedPostsSnapshot(page, limit, type), 'listPublishedPaged');
    }
  },

  async listAll(): Promise<Post[]> {
    if (env.DATABASE_URL) return listAllArticles();
    if (isMongoConfigured()) return mongoListAll();
    return proxyJson<Post[]>('/api/internal/posts?all=true');
  },

  async getBySlug(slug: string): Promise<Post | null> {
    if (env.DATABASE_URL) return getArticleBySlug(slug);
    if (isMongoConfigured()) return mongoGetBySlug(slug);
    try {
      const result = await proxyJson<{ post: Post | null }>(`/api/internal/posts/${encodeURIComponent(slug)}`);
      return result.post;
    } catch (error) {
      return runSnapshotFallback(error, () => getPostFromSnapshot(slug), `getBySlug:${slug}`);
    }
  },

  async search(query: string): Promise<Post[]> {
    if (env.DATABASE_URL) return searchArticles(query);
    if (isMongoConfigured()) return mongoSearch(query);
    const qs = new URLSearchParams({ q: query }).toString();
    try {
      return await proxyJson<Post[]>(`/api/internal/posts?${qs}`);
    } catch (error) {
      return runSnapshotFallback(error, () => searchPostsSnapshot(query), `search:${query}`);
    }
  },

  async incrementViews(slug: string) {
    if (env.DATABASE_URL) {
      await incrementArticleViews(slug);
      return;
    }
    if (isMongoConfigured()) {
      await mongoIncrementViews(slug);
      return;
    }
    await proxyJson<{ ok: true }>(`/api/internal/posts/${encodeURIComponent(slug)}/views`, {
      method: 'POST',
    });
  },

  async create(input: CreatePostInput) {
    if (env.DATABASE_URL) return createArticle(input);
    if (isMongoConfigured()) return mongoCreate(input);
    const headers = new Headers();
    headers.set('x-internal-author-name', input.author);
    headers.set('x-internal-author-id', input.author_id);
    const result = await proxyJson<{ post: Post }>('/api/internal/posts', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    return result.post;
  },

  async update(slug: string, patch: Partial<CreatePostInput> & { status?: Post['status'] }) {
    if (env.DATABASE_URL) return updateArticleBySlug(slug, patch);
    if (isMongoConfigured()) return mongoUpdate(slug, patch);
    const result = await proxyJson<{ post: Post | null }>(`/api/internal/posts/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return result.post;
  },

  async deleteById(id: string) {
    if (env.DATABASE_URL) {
      await deleteArticleById(id);
      return;
    }
    if (isMongoConfigured()) {
      await mongoDeleteById(id);
      return;
    }
    await proxyJson<{ ok: true }>(`/api/articles/by-id/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async publishById(id: string) {
    if (env.DATABASE_URL) return publishArticleById(id);
    if (isMongoConfigured()) return mongoPublishById(id);
    const result = await proxyJson<{ post: Post | null }>(`/api/articles/by-id/${encodeURIComponent(id)}/publish`, {
      method: 'POST',
    });
    return result.post;
  },
};
