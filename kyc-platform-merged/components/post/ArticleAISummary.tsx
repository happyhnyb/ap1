'use client';

import { useEffect, useState } from 'react';

type Persona = 'general' | 'farmer' | 'trader' | 'procurement';

interface SummaryResponse {
  mode: 'article_summary';
  persona: Persona;
  title: string;
  summary: string;
  bullets: string[];
  citations: Array<{
    id: string;
    title: string;
    kind: string;
    slug?: string | null;
    href?: string | null;
    excerpt: string;
    snippet: string;
    score: number;
  }>;
}

const PERSONA_LABELS: Record<Persona, string> = {
  general: 'General',
  farmer: 'Farmer',
  trader: 'Trader',
  procurement: 'Procurement',
};

export function ArticleAISummary({ slug }: { slug: string }) {
  const [persona, setPersona] = useState<Persona>('general');
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/ai/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, persona }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Summary unavailable.');
        if (!cancelled) setSummary(data);
      } catch (err) {
        if (!cancelled) {
          setSummary(null);
          setError(err instanceof Error ? err.message : 'Summary unavailable.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [slug, persona]);

  return (
    <section style={{ marginBottom: 24, padding: 20, borderRadius: 16, border: '1px solid var(--border2)', background: 'rgba(76,175,80,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div className="unwind-badge" style={{ marginBottom: 8 }}>Powered by Unwind AI</div>
          <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6, fontWeight: 700 }}>
            AI Summary
          </div>
          <div style={{ fontFamily: 'Lora,serif', fontSize: 19, fontWeight: 600 }}>Grounded article brief</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(Object.keys(PERSONA_LABELS) as Persona[]).map((option) => (
            <button
              key={option}
              type="button"
              className="btn btn-sm"
              onClick={() => setPersona(option)}
              style={{
                fontSize: 11,
                background: persona === option ? 'var(--bg4)' : 'transparent',
                border: persona === option ? '1px solid var(--border2)' : '1px solid var(--border)',
              }}
            >
              {PERSONA_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 14, color: 'var(--muted)' }}>Building grounded summary…</div>
      ) : error ? (
        <div className="notice notice-gold" style={{ marginBottom: 0 }}>
          {error}
        </div>
      ) : summary ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>{summary.summary}</p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            {summary.bullets.slice(0, 5).map((bullet) => (
              <li key={bullet} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--green)', fontSize: 11, lineHeight: '1.7', flexShrink: 0, marginTop: 1 }}>•</span>
                <span style={{
                  fontSize: 12, color: 'var(--muted)', lineHeight: 1.6,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {bullet}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
