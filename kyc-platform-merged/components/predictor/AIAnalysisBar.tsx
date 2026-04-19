'use client';

import { useEffect, useState } from 'react';

type Props = {
  commodity: string;
  state: string;
  market?: string;
  horizon: number;
};

type Analysis = {
  answer: string;
  drivers: string[];
  risks: string[];
  watchouts: string[];
};

export default function AIAnalysisBar({ commodity, state, market, horizon }: Props) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setAnalysis(null);

    fetch('/api/ai/forecast-explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commodity, state, market, horizon }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: { answer?: string; drivers?: string[]; risks?: string[]; watchouts?: string[] }) => {
        if (!cancelled) setAnalysis({
          answer:    data.answer    ?? '',
          drivers:   (data.drivers  ?? []).slice(0, 3),
          risks:     (data.risks    ?? []).slice(0, 2),
          watchouts: (data.watchouts ?? []).slice(0, 1),
        });
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [commodity, state, market, horizon]);

  if (error) return null;

  return (
    <div className="pr-ai-bar">
      <div className="pr-ai-bar-head">
        <span className="pr-ai-icon" aria-hidden="true">✦</span>
        <span className="pr-ai-label">AI Analysis</span>
        <span className="pr-ai-badge">Beta</span>
      </div>

      {loading ? (
        <div className="pr-ai-shimmer">
          <div className="pr-ai-shimmer-line w-full" />
          <div className="pr-ai-shimmer-line w-3/4" />
          <div className="pr-ai-shimmer-dots">
            <div className="pr-ai-shimmer-dot" />
            <div className="pr-ai-shimmer-dot" />
            <div className="pr-ai-shimmer-dot" />
          </div>
        </div>
      ) : analysis ? (
        <>
          <p className="pr-ai-answer">{analysis.answer}</p>
          {analysis.drivers.length > 0 && (
            <ul className="pr-ai-drivers">
              {analysis.drivers.map((d, i) => (
                <li key={i} className="pr-ai-driver">{d}</li>
              ))}
            </ul>
          )}
          {(analysis.risks.length > 0 || analysis.watchouts.length > 0) && (
            <ul className="pr-ai-risks">
              {[...analysis.risks, ...analysis.watchouts].map((r, i) => (
                <li key={i} className="pr-ai-risk">{r}</li>
              ))}
            </ul>
          )}
          <p className="pr-ai-disclaimer">AI analysis · Verify independently · Not financial advice</p>
        </>
      ) : null}
    </div>
  );
}
