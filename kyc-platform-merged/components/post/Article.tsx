import Link from 'next/link';
import Image from 'next/image';
import type { Post } from '@/types/post';
import { fmtDate } from '@/lib/utils';
import { PostThumb } from '@/components/feed/PostThumb';

function renderBody(body: string) {
  return body.split('\n\n').map((part, i) => {
    if (part.startsWith('## ')) return <h2 key={i} className="article-body-h2">{part.slice(3)}</h2>;
    if (part.startsWith('### ')) return <h3 key={i} className="article-body-h3">{part.slice(4)}</h3>;
    if (part.startsWith('> ')) return <blockquote key={i} className="article-body-bq">{part.slice(2)}</blockquote>;
    return <p key={i}>{part}</p>;
  });
}

export function Article({
  post,
  canRead = true,
  linkedArticle,
}: {
  post: Post;
  canRead?: boolean;
  linkedArticle?: Post | null;
}) {
  const teaserLen = Math.max(400, Math.floor(post.body.length * 0.22));

  return (
    <div className="article-shell">
      {/* Back link */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/" style={{ fontSize: 13, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          ← Back to feed
        </Link>
      </div>

      <article className="card-elevated" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Hero image — real photo if set, emoji fallback otherwise */}
        {post.hero_image ? (
          <div style={{ position: 'relative', width: '100%', height: 320, borderRadius: '20px 20px 0 0', overflow: 'hidden' }}>
            <Image
              src={post.hero_image}
              alt={post.title}
              fill
              priority
              sizes="(max-width: 860px) 100vw, 860px"
              style={{ objectFit: 'cover' }}
              unoptimized={post.hero_image.startsWith('/')}
            />
          </div>
        ) : (
          <PostThumb label={post.img} className="post-thumb" style={{ minHeight: 240, borderRadius: '20px 20px 0 0', fontSize: 72 }} />
        )}

        <div style={{ padding: '28px 32px 36px' }}>
          {/* Meta top */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <span className="badge">{post.category}</span>
            <span className="badge badge-type" style={{ color: post.type === 'ARTICLE' ? 'var(--gold)' : post.type === 'STORY' ? 'var(--green)' : 'var(--muted)' }}>
              {post.type}
            </span>
            {post.is_premium && <span className="badge badge-gold" style={{ fontSize: 10 }}>★ Pro</span>}
          </div>

          <h1 style={{ fontFamily: 'Lora,serif', fontSize: 'clamp(26px,4vw,42px)', lineHeight: 1.08, margin: '0 0 14px', fontWeight: 700 }}>
            {post.title}
          </h1>

          <p style={{ fontSize: 18, color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 20px', fontFamily: 'Lora,serif', fontStyle: 'italic' }}>
            {post.excerpt}
          </p>

          <div className="post-meta" style={{ paddingBottom: 24, borderBottom: '1px solid var(--border)', marginBottom: 28 }}>
            <span style={{ fontWeight: 500 }}>{post.author}</span>
            <span className="post-meta-dot">{fmtDate(post.published_at)}</span>
            <span className="post-meta-dot" style={{ color: 'var(--dim)' }}>{post.view_count.toLocaleString()} reads</span>
          </div>

          {/* Body */}
          <div className="article-body">
            {canRead ? (
              renderBody(post.body)
            ) : (
              <>
                {/* Teaser */}
                <div style={{ position: 'relative' }}>
                  {renderBody(post.body.slice(0, teaserLen))}
                  {/* Fade out */}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: 120,
                    background: 'linear-gradient(transparent, var(--bg3))',
                    pointerEvents: 'none',
                  }} />
                </div>

                {/* Paywall prompt */}
                <div style={{ marginTop: 32, padding: '28px 24px', borderRadius: 16, border: '1px solid rgba(255,193,7,.25)', background: 'linear-gradient(135deg,rgba(255,193,7,.05),rgba(76,175,80,.05))', textAlign: 'center' }}>
                  <span className="badge badge-gold" style={{ marginBottom: 14, display: 'inline-flex' }}>★ KYC Pro</span>
                  <h3 style={{ fontFamily: 'Lora,serif', fontSize: 22, margin: '0 0 8px' }}>Continue reading with Pro</h3>
                  <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 20px' }}>
                    This {post.type.toLowerCase()} is available to KYC Pro subscribers. Unlock full access, AI search, and commodity forecasting.
                  </p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Link href="/subscribe" className="btn btn-gold">Subscribe from ₹199/month</Link>
                    <Link href="/login" className="btn">Sign in</Link>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Linked premium article CTA (for stories with a deep-dive) */}
          {canRead && linkedArticle && (
            <div style={{ marginTop: 36, padding: '20px 22px', borderRadius: 14, border: '1px solid rgba(255,193,7,.3)', background: 'rgba(255,193,7,.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6, fontWeight: 600 }}>★ Full Premium Analysis</div>
                <div style={{ fontFamily: 'Lora,serif', fontSize: 17, fontWeight: 600 }}>{linkedArticle.title}</div>
              </div>
              <Link href={`/post/${linkedArticle.slug}`} className="btn btn-gold btn-sm" style={{ flexShrink: 0 }}>
                Read full analysis →
              </Link>
            </div>
          )}

          {/* Predictor CTA */}
          {canRead && post.tags.some((t) => ['wheat', 'rice', 'soybean', 'cotton', 'onion', 'tomato', 'mustard', 'maize'].includes(t.toLowerCase())) && (
            <div style={{ marginTop: 20, padding: '16px 20px', borderRadius: 14, border: '1px solid var(--border2)', background: 'rgba(76,175,80,.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>⚡ See live mandi prices & forecasts for commodities in this story</span>
              <Link href="/premium/predictor" className="btn btn-sm" style={{ fontSize: 12 }}>Open Predictor</Link>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

import React from 'react';
