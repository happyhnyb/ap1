import Link from 'next/link';
import type { Post } from '@/types/post';
import { timeAgo } from '@/lib/utils';
import { PostThumb } from './PostThumb';
import { MandiWidget } from './MandiWidget';

function TypeBadge({ type }: { type: Post['type'] }) {
  const colors: Record<Post['type'], string> = {
    SHORT:   'var(--muted)',
    STORY:   'var(--green)',
    ARTICLE: 'var(--gold)',
  };
  return (
    <span className="badge badge-type" style={{ color: colors[type], borderColor: `${colors[type]}33` }}>
      {type}
    </span>
  );
}

function PostMeta({ post }: { post: Post }) {
  return (
    <div className="post-meta">
      <span>{post.author}</span>
      <span className="post-meta-dot">{timeAgo(post.published_at)}</span>
      {post.is_premium && <span className="badge badge-gold" style={{ fontSize: 10 }}>★ Pro</span>}
    </div>
  );
}

export default function Feed({ posts }: { posts: Post[] }) {
  if (!posts.length) return (
    <main className="container" style={{ padding: '80px 0', textAlign: 'center', color: 'var(--muted)' }}>
      <p style={{ fontSize: 18 }}>No published content yet.</p>
    </main>
  );

  const hero    = posts[0];
  const side    = posts.slice(1, 4);
  const latest  = posts.slice(0, 6);
  const analysis = posts.filter((p) => p.type !== 'SHORT').slice(0, 4);
  const mostRead = [...posts].sort((a, b) => b.view_count - a.view_count).slice(0, 5);

  return (
    <main className="container" style={{ paddingBottom: 60 }}>

      {/* ── Hero ──────────────────────────────────────── */}
      <section className="feed-hero">
        <Link href={`/post/${hero.slug}`} className="card-elevated post-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <PostThumb label={hero.img} src={hero.hero_image} className="post-thumb post-thumb-hero" />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="badge">{hero.category}</span>
            <TypeBadge type={hero.type} />
          </div>
          <h1 className="post-title post-title-hero">{hero.title}</h1>
          <p className="post-excerpt truncate-3">{hero.excerpt}</p>
          <PostMeta post={hero} />
        </Link>

        <div className="feed-hero-side">
          {side.map((post) => (
            <Link key={post._id} href={`/post/${post.slug}`} className="card post-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="badge" style={{ fontSize: 10 }}>{post.category}</span>
                <TypeBadge type={post.type} />
              </div>
              <h2 className="post-title post-title-sm">{post.title}</h2>
              <p className="post-excerpt truncate-2" style={{ fontSize: 13 }}>{post.excerpt}</p>
              <PostMeta post={post} />
            </Link>
          ))}
        </div>
      </section>

      {/* ── Latest ────────────────────────────────────── */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Latest</h2>
          <Link href="/feed" className="btn btn-sm" style={{ fontSize: 12 }}>Browse all →</Link>
        </div>
        <div className="grid-3">
          {latest.map((post) => (
            <Link key={post._id} href={`/post/${post.slug}`} className="card post-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <PostThumb label={post.img} src={post.hero_image} className="post-thumb post-thumb-card" />
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="badge" style={{ fontSize: 10 }}>{post.category}</span>
                <TypeBadge type={post.type} />
              </div>
              <h3 className="post-title post-title-sm">{post.title}</h3>
              <p className="post-excerpt truncate-2">{post.excerpt}</p>
              <PostMeta post={post} />
            </Link>
          ))}
        </div>
      </section>

      {/* ── Analysis + Most Read ──────────────────────── */}
      <section className="section" style={{ display: 'grid', gridTemplateColumns: '1.35fr 0.85fr', gap: 20 }}>
        <div>
          <div className="section-header">
            <h2 className="section-title">Analysis & Deep Dives</h2>
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            {analysis.map((post) => (
              <Link key={post._id} href={`/post/${post.slug}`} className="card post-card" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'start', padding: 18 }}>
                <PostThumb label={post.img} src={post.hero_image} className="post-thumb" style={{ width: 72, height: 72, minHeight: 'unset', borderRadius: 10, fontSize: 30 }} />
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span className="badge" style={{ fontSize: 10 }}>{post.category}</span>
                    <TypeBadge type={post.type} />
                  </div>
                  <h3 className="post-title post-title-sm" style={{ fontSize: 17 }}>{post.title}</h3>
                  <p className="post-excerpt truncate-2" style={{ fontSize: 13 }}>{post.excerpt}</p>
                  <PostMeta post={post} />
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className="section-header">
            <h2 className="section-title">Most Read</h2>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {mostRead.map((post, i) => (
              <Link key={post._id} href={`/post/${post.slug}`} className="card post-card" style={{ padding: 14, display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12, alignItems: 'start' }}>
                <span style={{ fontFamily: 'Lora,serif', fontSize: 22, fontWeight: 700, color: 'var(--border2)', lineHeight: 1 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div style={{ display: 'grid', gap: 6 }}>
                  <h3 className="post-title" style={{ fontSize: 14, lineHeight: 1.3 }}>{post.title}</h3>
                  <span style={{ fontSize: 11, color: 'var(--dim)' }}>{post.view_count.toLocaleString()} reads</span>
                </div>
              </Link>
            ))}
            <MandiWidget />
          </div>
        </div>
      </section>

      {/* ── Premium CTA ───────────────────────────────── */}
      <section className="section">
        <div className="card-elevated" style={{ padding: '40px 36px', textAlign: 'center', background: 'linear-gradient(135deg, rgba(76,175,80,.06) 0%, rgba(255,193,7,.04) 100%)' }}>
          <span className="badge badge-gold" style={{ marginBottom: 16, display: 'inline-flex' }}>★ KYC Pro</span>
          <h2 className="serif" style={{ fontSize: 28, margin: '0 0 10px' }}>Unlock deep analysis + commodity forecasting</h2>
          <p style={{ color: 'var(--muted)', marginBottom: 24, maxWidth: 520, marginInline: 'auto' }}>
            Premium subscribers get full article access, AI-powered search, and real-time mandi price predictions.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/subscribe" className="btn btn-gold btn-lg">Subscribe from ₹199/month</Link>
            <Link href="/premium/predictor" className="btn btn-lg">View Predictor Preview</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

// Add React import for CSSProperties
import React from 'react';
