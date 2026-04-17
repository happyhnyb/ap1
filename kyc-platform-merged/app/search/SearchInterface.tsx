'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface SearchItem {
  slug: string;
  title: string;
  type: string;
  category: string;
  excerpt: string;
  snippet: string;
  is_premium: boolean;
  published_at: string | null;
  author: string;
  score: number;
}

interface AIResult {
  mode?: 'copilot';
  answer: string;
  sources: { id?: string; slug?: string | null; href?: string | null; title: string; excerpt: string; snippet?: string; score?: number; kind?: string }[];
  snippets: string[];
  confidence: 'high' | 'medium' | 'low' | 'insufficient';
  query: string;
  bullets?: string[];
  followUps?: string[];
  guardrails?: string[];
  persona?: 'farmer' | 'trader' | 'procurement' | 'general';
}

interface PersonalizationResult {
  mode?: 'personalization';
  summary: string;
  recommendedQueries: string[];
  recommendedSources: { id?: string; slug?: string | null; href?: string | null; title: string; excerpt: string; snippet?: string }[];
}

function timeAgo(date: string | null) {
  if (!date) return '';
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'var(--green)', medium: 'var(--gold)', low: 'var(--muted)', insufficient: 'var(--red)',
};

export default function SearchInterface({ initialQuery, canAISearch }: { initialQuery: string; canAISearch: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<'standard' | 'ai'>('standard');
  const [persona, setPersona] = useState<'farmer' | 'trader' | 'procurement' | 'general'>('general');
  const [typeFilter, setTypeFilter] = useState('');
  const [premiumFilter, setPremiumFilter] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [personalization, setPersonalization] = useState<PersonalizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [personalizing, setPersonalizing] = useState(false);
  const [searched, setSearched] = useState(!!initialQuery);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (
    q: string,
    m: string,
    type: string,
    premium: string,
    personaOverride?: 'farmer' | 'trader' | 'procurement' | 'general'
  ) => {
    if (!q.trim()) { setResults([]); setAiResult(null); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    setError('');

    try {
      if (m === 'ai') {
        const activePersona = personaOverride ?? persona;
        const res = await fetch(`/api/ai-search?q=${encodeURIComponent(q)}&persona=${encodeURIComponent(activePersona)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setAiResult(data);
        setResults([]);
      } else {
        const params = new URLSearchParams({ q });
        if (type) params.set('type', type);
        if (premium) params.set('premium', premium);
        const res = await fetch(`/api/search?${params}`);
        const data = await res.json();
        setResults(data.results || []);
        setAiResult(null);
        router.replace(`/search?${params}`, { scroll: false });
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setLoading(false);
    }
  }, [persona, router]);

  function handleQueryChange(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val, mode, typeFilter, premiumFilter), 350);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSearch(query, mode, typeFilter, premiumFilter);
  }

  useEffect(() => {
    if (initialQuery) doSearch(initialQuery, 'standard', '', '');
  }, [initialQuery, doSearch]);

  useEffect(() => {
    if (!canAISearch || mode !== 'ai' || !query.trim()) {
      setPersonalization(null);
      return;
    }

    let cancelled = false;
    const interests = query
      .split(/[,\s]+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 2)
      .slice(0, 6);

    async function loadPersonalization() {
      setPersonalizing(true);
      try {
        const res = await fetch('/api/ai/personalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ persona, interests }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Personalization unavailable.');
        if (!cancelled) setPersonalization(data);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setPersonalization(null);
        }
      } finally {
        if (!cancelled) setPersonalizing(false);
      }
    }

    loadPersonalization();
    return () => { cancelled = true; };
  }, [canAISearch, mode, persona, query]);

  return (
    <main className="container" style={{ paddingBottom: 60 }}>
      <div style={{ paddingTop: 36, paddingBottom: 28 }}>
        <h1 className="serif" style={{ fontSize: 36, marginBottom: 6 }}>Search</h1>
        <p style={{ color: 'var(--muted)', margin: 0, fontSize: 15 }}>
          Full-text search and grounded AI answers across articles, policy notes, explainers, and methodology docs
        </p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSubmit}>
        <div className="search-wrap" style={{ marginBottom: 16 }}>
          <span style={{ color: 'var(--dim)', fontSize: 18 }}>⌕</span>
          <input
            className="search-input"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search articles, analysis, sectors, commodities…"
            autoFocus
          />
          {loading && <span style={{ fontSize: 13, color: 'var(--dim)', padding: '0 8px' }}>…</span>}
          <button type="submit" className="btn btn-sm btn-primary" style={{ fontSize: 13 }}>Search</button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg2)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
            <button type="button" onClick={() => { setMode('standard'); doSearch(query, 'standard', typeFilter, premiumFilter); }}
              className="btn btn-sm" style={{ fontSize: 12, background: mode === 'standard' ? 'var(--bg3)' : 'transparent', border: 'none' }}>
              Standard
            </button>
            <button type="button" onClick={() => {
              if (!canAISearch) return;
              setMode('ai');
              doSearch(query, 'ai', typeFilter, premiumFilter);
            }}
              className="btn btn-sm" style={{ fontSize: 12, background: mode === 'ai' ? 'var(--bg3)' : 'transparent', border: 'none', position: 'relative' }}>
              ✦ AI Search
              {!canAISearch && (
                <span className="badge badge-gold" style={{ fontSize: 9, marginLeft: 6 }}>Pro</span>
              )}
            </button>
          </div>

          {mode === 'standard' && (
            <>
              <select className="select" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); doSearch(query, mode, e.target.value, premiumFilter); }}
                style={{ width: 'auto', padding: '7px 12px' }}>
                <option value="">All types</option>
                <option value="SHORT">Short</option>
                <option value="STORY">Story</option>
                <option value="ARTICLE">Article</option>
              </select>
              <select className="select" value={premiumFilter} onChange={(e) => { setPremiumFilter(e.target.value); doSearch(query, mode, typeFilter, e.target.value); }}
                style={{ width: 'auto', padding: '7px 12px' }}>
                <option value="">All access</option>
                <option value="false">Free only</option>
                <option value="true">Premium only</option>
              </select>
            </>
          )}

          {mode === 'ai' && (
            <select
              className="select"
              value={persona}
              onChange={(e) => {
                const nextPersona = e.target.value as 'farmer' | 'trader' | 'procurement' | 'general';
                setPersona(nextPersona);
                if (query.trim()) doSearch(query, mode, typeFilter, premiumFilter, nextPersona);
              }}
              style={{ width: 'auto', padding: '7px 12px' }}
            >
              <option value="general">General view</option>
              <option value="farmer">Farmer summary</option>
              <option value="trader">Trader summary</option>
              <option value="procurement">Procurement summary</option>
            </select>
          )}

          {searched && !loading && mode === 'standard' && (
            <span style={{ fontSize: 13, color: 'var(--dim)', marginLeft: 4 }}>
              {results.length} result{results.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </form>

      <div style={{ marginTop: 28 }}>
        {error && (
          <div className="notice notice-gold" style={{ marginBottom: 18 }}>
            {error}
          </div>
        )}

        {mode === 'ai' && canAISearch && (personalization || personalizing) && (
          <div className="card" style={{ padding: 18, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 600 }}>Personalized View</div>
                <div style={{ fontFamily: 'Lora,serif', fontSize: 18, fontWeight: 600 }}>Recommended angles for this persona</div>
              </div>
              {personalizing && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Refreshing…</span>}
            </div>
            {personalization && (
              <div style={{ display: 'grid', gap: 12 }}>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--muted)' }}>{personalization.summary}</p>
                {!!personalization.recommendedQueries?.length && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {personalization.recommendedQueries.map((recommendedQuery) => (
                      <button
                        key={recommendedQuery}
                        type="button"
                        className="btn btn-sm"
                        style={{ fontSize: 11 }}
                        onClick={() => {
                          setQuery(recommendedQuery);
                          doSearch(recommendedQuery, 'ai', typeFilter, premiumFilter);
                        }}
                      >
                        {recommendedQuery}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* AI Result */}
        {mode === 'ai' && aiResult && (
          <div style={{ display: 'grid', gap: 18 }}>
            <div className="card-elevated" style={{ padding: 24 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 18 }}>✦</span>
                <h2 style={{ margin: 0, fontFamily: 'Lora,serif', fontSize: 20 }}>AI Answer</h2>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,.05)', color: CONFIDENCE_COLORS[aiResult.confidence] }}>
                  {aiResult.confidence} confidence
                </span>
              </div>
              <p style={{ fontSize: 16, lineHeight: 1.72, color: 'var(--text)', margin: 0 }}>{aiResult.answer}</p>
              {!!aiResult.bullets?.length && (
                <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
                  {aiResult.bullets.map((bullet) => (
                    <div key={bullet} style={{ fontSize: 14, color: 'var(--muted)' }}>
                      • {bullet}
                    </div>
                  ))}
                </div>
              )}
              {!!aiResult.guardrails?.length && (
                <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {aiResult.guardrails.map((guardrail) => (
                    <span key={guardrail} className="badge" style={{ fontSize: 10 }}>{guardrail}</span>
                  ))}
                </div>
              )}
            </div>

            {aiResult.sources.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>
                  Sources
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {aiResult.sources.map((src, i) => (
                    <Link key={src.id || src.slug || src.title} href={src.slug ? `/post/${src.slug}` : (src.href || '/search')} className="card" style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: '24px 1fr', gap: 12, alignItems: 'start' }}>
                      <span style={{ color: 'var(--dim)', fontWeight: 700, fontFamily: 'Lora,serif', fontSize: 14 }}>{i + 1}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                          {src.title}
                          {src.kind && <span className="badge" style={{ fontSize: 9, marginLeft: 8 }}>{src.kind}</span>}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{aiResult.snippets[i] || src.snippet || src.excerpt}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {!!aiResult.followUps?.length && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>
                  Suggested follow-ups
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {aiResult.followUps.map((followUp) => (
                    <button
                      key={followUp}
                      type="button"
                      className="btn btn-sm"
                      style={{ fontSize: 12 }}
                      onClick={() => {
                        setQuery(followUp);
                        doSearch(followUp, 'ai', typeFilter, premiumFilter);
                      }}
                    >
                      {followUp}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!canAISearch && (
              <div className="notice notice-gold" style={{ textAlign: 'center' }}>
                AI search is currently limited to eligible research-access accounts.
                <Link href="/subscribe" style={{ marginLeft: 8, color: 'var(--gold)', fontWeight: 600 }}>Access info →</Link>
              </div>
            )}
          </div>
        )}

        {/* Standard Results */}
        {mode === 'standard' && results.length > 0 && (
          <div style={{ display: 'grid', gap: 12 }}>
            {results.map((r) => (
              <Link key={r.slug} href={`/post/${r.slug}`} className="card" style={{ padding: 20, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="badge" style={{ fontSize: 10 }}>{r.category}</span>
                  <span className="badge badge-type" style={{ fontSize: 10 }}>{r.type}</span>
                  {r.is_premium && <span className="badge badge-gold" style={{ fontSize: 9 }}>★ Pro</span>}
                </div>
                <h2 style={{ fontFamily: 'Lora,serif', fontSize: 19, margin: 0, lineHeight: 1.2 }}>{r.title}</h2>
                <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
                  <span style={{ color: 'var(--green)', fontSize: 12 }}>›</span>{' '}
                  {r.snippet || r.excerpt}
                </p>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--dim)' }}>
                  <span>{r.author}</span>
                  <span>·</span>
                  <span>{timeAgo(r.published_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Empty state */}
        {searched && !loading && mode === 'standard' && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>🔍</div>
            <h3 style={{ fontFamily: 'Lora,serif', fontSize: 22, margin: '0 0 8px' }}>No results found</h3>
            <p style={{ margin: 0, fontSize: 14 }}>Try different keywords or remove filters</p>
          </div>
        )}

        {/* AI upsell for non-premium */}
        {!canAISearch && query && searched && (
          <div style={{ marginTop: 24, padding: '20px 24px', borderRadius: 14, border: '1px solid rgba(255,193,7,.25)', background: 'rgba(255,193,7,.04)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>✦ AI Search is being rolled out in stages</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>When enabled for your account, it returns grounded answers with source citations.</div>
            </div>
            <Link href="/subscribe" className="btn btn-gold btn-sm" style={{ flexShrink: 0 }}>View access info</Link>
          </div>
        )}
      </div>
    </main>
  );
}
