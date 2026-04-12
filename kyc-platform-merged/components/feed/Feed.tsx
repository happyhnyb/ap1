import Link from 'next/link';
import type { Post } from '@/types/post';
import { timeAgo } from '@/lib/utils';
import { PostThumb } from './PostThumb';
import { MandiWidget } from './MandiWidget';

function TypeBadge({ type }: { type: Post['type'] }) {
  const map: Record<Post['type'], { label: string; color: string }> = {
    SHORT:   { label: 'SHORT',   color: 'var(--muted)' },
    STORY:   { label: 'STORY',   color: 'var(--green)' },
    ARTICLE: { label: 'ARTICLE', color: 'var(--gold)'  },
  };
  const { label, color } = map[type];
  return <span className="badge badge-type" style={{ color, borderColor: `${color}33` }}>{label}</span>;
}

function PostMeta({ post }: { post: Post }) {
  return (
    <div className="post-meta">
      <span>{post.author}</span>
      <span className="post-meta-dot">{timeAgo(post.published_at)}</span>
      {post.is_premium && <span className="badge badge-gold" style={{ fontSize: 9 }}>★ Pro</span>}
    </div>
  );
}

export default function Feed({ posts }: { posts: Post[] }) {
  if (!posts.length) {
    return (
      <main className="container" style={{ padding: '80px 0', textAlign: 'center', color: 'var(--muted)' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🌾</div>
        <p style={{ fontSize: 18 }}>No published content yet.</p>
      </main>
    );
  }

  const hero     = posts[0];
  const side     = posts.slice(1, 4);
  const latest   = posts.slice(0, 6);
  const analysis = posts.filter((p) => p.type !== 'SHORT').slice(0, 4);
  const mostRead = [...posts].sort((a, b) => b.view_count - a.view_count).slice(0, 5);

  return (
    <main className="container" style={{ paddingBottom: 24 }}>

      {/* ── Hero ─────────────────────────────────────── */}
      <section className="feed-hero">
        <Link href={`/post/${hero.slug}`} className="card-elevated post-card-lg"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PostThumb label={hero.img} src={hero.hero_image} className="post-thumb post-thumb-hero" />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge">{hero.category}</span>
            <TypeBadge type={hero.type} />
          </div>
          <h1 className="post-title post-title-hero">{hero.title}</h1>
          <p className="post-excerpt truncate-3">{hero.excerpt}</p>
          <PostMeta post={hero} />
        </Link>

        <div className="feed-hero-side">
          {side.map((post) => (
            <Link key={post._id} href={`/post/${post.slug}`} className="card post-card"
              style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
              <PostThumb label={post.img} src={post.hero_image} className="post-thumb post-thumb-side" />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="badge" style={{ fontSize: 9 }}>{post.category}</span>
                <TypeBadge type={post.type} />
              </div>
              <h2 className="post-title post-title-sm truncate-2">{post.title}</h2>
              <PostMeta post={post} />
            </Link>
          ))}
        </div>
      </section>

      {/* ── Latest ───────────────────────────────────── */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Latest</h2>
          <Link href="/feed" className="btn btn-sm" style={{ fontSize: 12 }}>All stories →</Link>
        </div>
        <div className="grid-3">
          {latest.map((post) => (
            <Link key={post._id} href={`/post/${post.slug}`} className="card post-card"
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <PostThumb label={post.img} src={post.hero_image} className="post-thumb post-thumb-card" />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="badge" style={{ fontSize: 9 }}>{post.category}</span>
                <TypeBadge type={post.type} />
              </div>
              <h3 className="post-title post-title-sm truncate-2">{post.title}</h3>
              <p className="post-excerpt truncate-2">{post.excerpt}</p>
              <PostMeta post={post} />
            </Link>
          ))}
        </div>
      </section>

      {/* ── Analysis ─────────────────────────────────── */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Analysis & Deep Dives</h2>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {analysis.map((post) => (
            <Link key={post._id} href={`/post/${post.slug}`} className="card post-card"
              style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 14, alignItems: 'start', padding: 14 }}>
              <PostThumb label={post.img} src={post.hero_image} className="post-thumb"
                style={{ width: 64, height: 64, minHeight: 'unset', borderRadius: 10, fontSize: 26 }} />
              <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="badge" style={{ fontSize: 9 }}>{post.category}</span>
                  <TypeBadge type={post.type} />
                </div>
                <h3 className="post-title post-title-sm truncate-2" style={{ fontSize: 15 }}>{post.title}</h3>
                <p className="post-excerpt truncate-2" style={{ fontSize: 12 }}>{post.excerpt}</p>
                <PostMeta post={post} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Most Read + Mandi ────────────────────────── */}
      <section className="section" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
        <div>
          <div className="section-header"><h2 className="section-title">Most Read</h2></div>
          <div style={{ display: 'grid', gap: 8 }}>
            {mostRead.map((post, i) => (
              <Link key={post._id} href={`/post/${post.slug}`} className="card post-card"
                style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12, alignItems: 'center', padding: 14 }}>
                <span style={{ fontFamily: 'Lora,serif', fontSize: 20, fontWeight: 700, color: 'var(--border3)', lineHeight: 1 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                  <h3 className="post-title truncate-2" style={{ fontSize: 14, lineHeight: 1.35 }}>{post.title}</h3>
                  <span style={{ fontSize: 11, color: 'var(--dim)' }}>{post.view_count.toLocaleString()} reads</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <MandiWidget />
      </section>

      {/* ── Premium CTA ──────────────────────────────── */}
      <section className="section" style={{ paddingBottom: 8 }}>
        <div className="card-elevated" style={{
          padding: '32px 24px', textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(76,175,80,.07) 0%, rgba(255,179,0,.04) 100%)'
        }}>
          <span className="badge badge-gold" style={{ marginBottom: 14, display: 'inline-flex' }}>★ KYC Pro</span>
          <h2 className="serif" style={{ fontSize: 'clamp(20px,4vw,28px)', marginBottom: 10 }}>
            Unlock deep analysis &amp; commodity forecasting
          </h2>
          <p style={{ color: 'var(--muted)', marginBottom: 22, maxWidth: 480, marginInline: 'auto', fontSize: 14 }}>
            Premium subscribers get full article access, AI-powered search, and real-time mandi price predictions.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/subscribe"          className="btn btn-gold btn-lg">Subscribe from ₹199/mo</Link>
            <Link href="/premium/predictor"  className="btn btn-lg">View Predictor</Link>
          </div>
        </div>
      </section>

    </main>
  );
}

import React from 'react';
