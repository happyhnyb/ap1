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

// ── Mongo implementation ─────────────────────────────────────────
const mongo = {
  async listPublished() {
    await connectDB();
    const docs = await PostModel.find({ status: 'published' }).sort({ published_at: -1 }).lean();
    return docs.map((d) => toPost(d as unknown as Record<string, unknown>));
  },
  async listAll() {
    await connectDB();
    const docs = await PostModel.find().sort({ updated_at: -1 }).lean();
    return docs.map((d) => toPost(d as unknown as Record<string, unknown>));
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
    return docs.map((d) => toPost(d as unknown as Record<string, unknown>));
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

// ── Memory implementation ────────────────────────────────────────
const memory = {
  async listPublished() {
    return memoryPosts.filter((p) => p.status === 'published').sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));
  },
  async listAll() {
    return [...memoryPosts].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },
  async getBySlug(slug: string) {
    return memoryPosts.find((p) => p.slug === slug) ?? null;
  },
  async search(query: string) {
    const q = query.toLowerCase();
    return memoryPosts.filter((p) => p.status === 'published' && (
      p.title.toLowerCase().includes(q) ||
      p.excerpt.toLowerCase().includes(q) ||
      p.body.toLowerCase().includes(q) ||
      p.tags.some((tag) => tag.toLowerCase().includes(q))
    ));
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
      hero_image: null,
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
export const postsAdapter = isMongoConfigured() ? mongo : memory;
