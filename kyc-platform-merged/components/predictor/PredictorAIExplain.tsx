'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Citation {
  id: string;
  title: string;
  kind: string;
  slug?: string | null;
  href?: string | null;
  excerpt: string;
  snippet: string;
  score: number;
}

interface ForecastExplainResponse {
  mode: 'forecast_explanation';
  commodity: string;
  answer: string;
  drivers: string[];
  risks: string[];
  watchouts: string[];
  citations: Citation[];
}

export function PredictorAIExplain({
  commodity,
  state,
  market,
  horizon,
}: {
  commodity: string;
  state?: string;
  market?: string;
  horizon: number;
}) {
  const [data, setData] = useState<ForecastExplainResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!commodity) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/ai/forecast-explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commodity,
            state,
            market,
            horizon,
            question: `Explain the biggest drivers and risks for the next ${horizon} days.`,
          }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || 'Forecast explanation unavailable.');
        if (!cancelled) setData(payload);
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : 'Forecast explanation unavailable.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [commodity, state, market, horizon]);

  return (
    <div style={{ marginTop: 18, padding: 18, borderRadius: 14, border: '1px solid var(--border2)', background: 'rgba(255,255,255,.03)' }}>
      <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, fontWeight: 700 }}>
        AI Forecast Brief
      </div>
      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Explaining trusted forecast data…</div>
      ) : error ? (
        <div className="notice notice-gold" style={{ marginBottom: 0 }}>{error}</div>
      ) : data ? (
        <div style={{ display: 'grid', gap: 14 }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>{data.answer}</p>
          {!!data.drivers.length && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 8 }}>Top drivers</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {data.drivers.map((driver) => (
                  <span key={driver} className="badge" style={{ fontSize: 10 }}>{driver}</span>
                ))}
              </div>
            </div>
          )}
          {!!data.risks.length && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 8 }}>Risks</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {data.risks.map((risk) => (
                  <div key={risk} style={{ fontSize: 12, color: 'var(--muted)' }}>
                    • {risk}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!!data.watchouts.length && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {data.watchouts.map((watchout) => (
                <span key={watchout} className="badge badge-gold" style={{ fontSize: 10 }}>{watchout}</span>
              ))}
            </div>
          )}
          {!!data.citations.length && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 8 }}>Sources</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {data.citations.slice(0, 3).map((citation) => (
                  <Link
                    key={citation.id}
                    href={citation.slug ? `/post/${citation.slug}` : (citation.href || '/search')}
                    className="card"
                    style={{ padding: '10px 12px' }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{citation.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{citation.snippet || citation.excerpt}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
