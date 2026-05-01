import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import type { Post } from '@/types/post';

// Statically imported so bundlers always include the file regardless of
// how process.cwd() resolves at runtime in serverless environments.
const require = createRequire(import.meta.url);
const BUNDLED_SNAPSHOT: { posts?: unknown[] } | unknown[] | null = (() => {
  try { return require('../../data/fallback/posts-snapshot.json'); } catch { return null; }
})();

type SnapshotFile = {
  generatedAt?: string;
  source?: string;
  posts?: unknown[];
};

type SnapshotCandidate = Partial<Post> & {
  article_no?: number;
  date?: string;
  time?: string;
  img_name?: string;
};

const SNAPSHOT_PATH = path.resolve(process.cwd(), 'data/fallback/posts-snapshot.json');
const MOCKS_PATH = path.resolve(process.cwd(), 'mocks/tradeTalkPosts.json');

let snapshotCache: Post[] | null = null;

function coerceIsoDate(value: unknown, fallback: string) {
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return fallback;
}

function normalizePost(candidate: SnapshotCandidate, index: number): Post | null {
  if (!candidate.slug || !candidate.title || !candidate.body) return null;

  const fallbackTimestamp = new Date(Date.UTC(2026, 0, 1 + index, 0, 0, 0)).toISOString();
  const publishedAt = coerceIsoDate(candidate.published_at ?? candidate.date, fallbackTimestamp);
  const createdAt = coerceIsoDate(candidate.created_at, publishedAt);
  const updatedAt = coerceIsoDate(candidate.updated_at, createdAt);
  const excerpt = typeof candidate.excerpt === 'string' && candidate.excerpt.trim()
    ? candidate.excerpt.trim()
    : candidate.body.replace(/\s+/g, ' ').trim().slice(0, 220);

  return {
    _id: typeof candidate._id === 'string' && candidate._id.trim()
      ? candidate._id
      : `snapshot-${candidate.article_no ?? index + 1}`,
    type: candidate.type === 'SHORT' || candidate.type === 'STORY' || candidate.type === 'ARTICLE'
      ? candidate.type
      : 'ARTICLE',
    title: candidate.title,
    slug: candidate.slug,
    excerpt,
    body: candidate.body,
    author: typeof candidate.author === 'string' && candidate.author.trim() ? candidate.author : 'KYC Desk',
    author_id: typeof candidate.author_id === 'string' && candidate.author_id.trim() ? candidate.author_id : 'snapshot',
    tags: Array.isArray(candidate.tags) ? candidate.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0) : [],
    category: typeof candidate.category === 'string' && candidate.category.trim() ? candidate.category : 'Trade Talk',
    is_premium: Boolean(candidate.is_premium),
    linked_article_id: typeof candidate.linked_article_id === 'string' ? candidate.linked_article_id : null,
    status: candidate.status === 'draft' || candidate.status === 'archived' || candidate.status === 'published'
      ? candidate.status
      : 'published',
    published_at: publishedAt,
    created_at: createdAt,
    updated_at: updatedAt,
    view_count: Number.isFinite(candidate.view_count) ? Number(candidate.view_count) : 0,
    img: typeof candidate.img === 'string' && candidate.img.trim()
      ? candidate.img
      : (typeof candidate.img_name === 'string' && candidate.img_name.trim() ? candidate.img_name : 'crops'),
    hero_image: typeof candidate.hero_image === 'string' && candidate.hero_image.trim() ? candidate.hero_image : null,
    inline_images: Array.isArray(candidate.inline_images)
      ? candidate.inline_images.filter((image): image is string => typeof image === 'string' && image.trim().length > 0)
      : [],
  };
}

function readSnapshotCandidates() {
  // Try filesystem paths first (self-hosted / local dev)
  for (const filePath of [SNAPSHOT_PATH, MOCKS_PATH]) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as SnapshotFile | SnapshotCandidate[];
      const candidates = Array.isArray(parsed) ? parsed : parsed.posts;
      if (Array.isArray(candidates) && candidates.length) {
        return candidates as SnapshotCandidate[];
      }
    } catch { /* skip corrupt file */ }
  }

  // Fall back to the statically bundled copy (always available in serverless)
  if (BUNDLED_SNAPSHOT) {
    const candidates = Array.isArray(BUNDLED_SNAPSHOT)
      ? BUNDLED_SNAPSHOT
      : (BUNDLED_SNAPSHOT as SnapshotFile).posts;
    if (Array.isArray(candidates) && candidates.length) {
      return candidates as SnapshotCandidate[];
    }
  }

  return [];
}

export function getPostsSnapshot(): Post[] {
  if (snapshotCache) return snapshotCache;

  const normalized = readSnapshotCandidates()
    .map((candidate, index) => normalizePost(candidate, index))
    .filter((post): post is Post => Boolean(post))
    .sort((left, right) => {
      const leftTime = left.published_at ? new Date(left.published_at).getTime() : 0;
      const rightTime = right.published_at ? new Date(right.published_at).getTime() : 0;
      return rightTime - leftTime;
    });

  snapshotCache = normalized;
  return normalized;
}

export function getPagedPostsSnapshot(page: number, limit: number, type?: string) {
  const normalizedType = type?.toUpperCase();
  const filtered = normalizedType
    ? getPostsSnapshot().filter((post) => post.type === normalizedType)
    : getPostsSnapshot();
  const offset = Math.max(0, (page - 1) * limit);

  return {
    posts: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
}

export function getPostFromSnapshot(slug: string) {
  return getPostsSnapshot().find((post) => post.slug === slug) ?? null;
}

export function searchPostsSnapshot(query: string) {
  const term = query.trim().toLowerCase();
  if (!term) return [];

  return getPostsSnapshot()
    .filter((post) => {
      const haystack = `${post.title}\n${post.excerpt}\n${post.body}`.toLowerCase();
      return haystack.includes(term);
    })
    .slice(0, 30);
}
