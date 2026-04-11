'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { Post } from '@/types/post';
import { PostThumb } from './PostThumb';
import { timeAgo } from '@/lib/utils';

const PAGE_SIZE = 12;
type TypeFilter = 'ALL' | 'ARTICLE' | 'STORY' | 'SHORT';

function TypeBadge({ type }: { type: Post['type'] }) {
  const color = type === 'ARTICLE' ? 'var(--gold)' : type === 'STORY' ? 'var(--green)' : 'var(--muted)';
  return (
    <span className="badge badge-type" style={{ color, borderColor: `${color}33` }}>{type}</span>
  );
}

function PostCard({ post }: { post: Post }) {
  return (
    <Link href={`/post/${post.slug}`} className="card post-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PostThumb label={post.img} src={post.hero_image} className="post-thumb post-thumb-card" />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="badge" style={{ fontSize: 10 }}>{post.category}</span>
        <TypeBadge type={post.type} />
        {post.is_premium && <span className="badge badge-gold" style={{ fontSize: 10 }}>★ Pro</span>}
      </div>
      <h3 className="post-title post-title-sm" style={{ fontSize: 17 }}>{post.title}</h3>
      <p className="post-excerpt truncate-2">{post.excerpt}</p>
      <div className="post-meta">
        <span>{post.author}</span>
        <span className="post-meta-dot">{timeAgo(post.published_at)}</span>
        {post.view_count > 0 && (
          <span className="post-meta-dot" style={{ color: 'var(--dim)' }}>{post.view_count.toLocaleString()} reads</span>
        )}
      </div>
    </Link>
  );
}

interface Props {
  initial: Post[];
  initialHasMore: boolean;
  initialTotal: number;
}

export default function FeedInfinite({ initial, initialHasMore, initialTotal }: Props) {
  const [posts, setPosts]     = useState<Post[]>(initial);
  const [page, setPage]       = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState<TypeFilter>('ALL');
  const [total, setTotal]     = useState(initialTotal);
  const sentinelRef           = useRef<HTMLDivElement>(null);
  const abortRef              = useRef<AbortController | null>(null);

  const fetchPage = useCallback(async (p: number, f: TypeFilter, append: boolean) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) });
      if (f !== 'ALL') params.set('type', f);
      const res  = await fetch(`/api/posts/feed?${params}`, { signal: abortRef.current.signal });
      if (!res.ok) return;
      const data = await res.json() as { posts: Post[]; total: number; hasMore: boolean };
      setPosts((prev) => append ? [...prev, ...data.posts] : data.posts);
      setHasMore(data.hasMore);
      setTotal(data.total);
      setPage(p);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset when filter changes
  useEffect(() => {
    fetchPage(1, filter, false);
  }, [filter, fetchPage]);

  // IntersectionObserver sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loading) {
          fetchPage(page + 1, filter, true);
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, page, filter, fetchPage]);

  const filterBtn = (f: TypeFilter, label: string) => (
    <button
      key={f}
      onClick={() => setFilter(f)}
      className="btn btn-sm"
      style={{
        background:   filter === f ? 'var(--green)'        : 'transparent',
        color:        filter === f ? '#fff'                : 'var(--muted)',
        borderColor:  filter === f ? 'var(--green-dark)'   : 'var(--border)',
        fontWeight:   filter === f ? 600 : 400,
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="container" style={{ paddingBottom: 80 }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
        {filterBtn('ALL',     'All')}
        {filterBtn('ARTICLE', 'Articles')}
        {filterBtn('STORY',   'Stories')}
        {filterBtn('SHORT',   'News Briefs')}
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--dim)' }}>
          {total.toLocaleString()} {total === 1 ? 'post' : 'posts'}
        </span>
      </div>

      {/* Grid */}
      {posts.length > 0 ? (
        <div className="grid-3">
          {posts.map((post) => <PostCard key={post._id} post={post} />)}
        </div>
      ) : !loading ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--muted)' }}>
          No {filter !== 'ALL' ? filter.toLowerCase() + 's' : 'posts'} published yet.
        </div>
      ) : null}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 24 }}>
        {loading && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--dim)', fontSize: 14 }}>
            <span className="skeleton" style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
            <span className="skeleton" style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
            <span className="skeleton" style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
          </div>
        )}
        {!loading && !hasMore && posts.length > 0 && (
          <p style={{ color: 'var(--dim)', fontSize: 13, margin: 0 }}>— You've reached the end —</p>
        )}
      </div>
    </div>
  );
}
