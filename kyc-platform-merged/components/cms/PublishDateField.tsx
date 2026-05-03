'use client';

import { useState } from 'react';
import { toDateInputValue } from '@/lib/posts/publish-date';

interface Props {
  initialValue?: string | null;
}

type ParseResponse = {
  success: boolean;
  dateOnly?: string;
  iso?: string;
  source?: 'ollama' | 'deterministic';
  fallback?: boolean;
  error?: string;
};

export function PublishDateField({ initialValue }: Props) {
  const [dateValue, setDateValue] = useState(toDateInputValue(initialValue));
  const [textValue, setTextValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function handleParse() {
    if (!textValue.trim()) {
      setError('Enter a date like "15 Feb 2025" or "2025-02-15" to parse it.');
      setInfo('');
      return;
    }

    setLoading(true);
    setError('');
    setInfo('');

    try {
      const res = await fetch('/api/local-ai/parse-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textValue }),
      });
      const data = await res.json() as ParseResponse;
      if (!res.ok || !data.success || !data.dateOnly) {
        throw new Error(data.error || 'Could not parse that date.');
      }
      setDateValue(data.dateOnly);
      setInfo(data.source === 'ollama' && !data.fallback ? 'Parsed using local AI.' : 'Parsed using the built-in date parser.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse that date.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label className="form-label">Publish / Original Date</label>
      <input
        className="field"
        type="date"
        name="published_at"
        value={dateValue}
        onChange={(event) => {
          setDateValue(event.target.value);
          if (error) setError('');
        }}
      />

      <div style={{ display: 'grid', gap: 8 }}>
        <label className="form-label" style={{ margin: 0 }}>
          Quick Parse
          <span style={{ color: 'var(--dim)', fontWeight: 400 }}> (optional)</span>
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="field"
            value={textValue}
            onChange={(event) => {
              setTextValue(event.target.value);
              if (error) setError('');
            }}
            placeholder='Examples: "15 Feb 2025", "15/02/2025", "2025-02-15"'
            style={{ flex: '1 1 240px' }}
          />
          <button type="button" className="btn btn-sm" onClick={handleParse} disabled={loading}>
            {loading ? 'Parsing…' : 'Parse date'}
          </button>
        </div>
      </div>

      {info ? (
        <p className="notice" style={{ margin: 0, padding: '8px 12px', fontSize: 13 }}>
          {info}
        </p>
      ) : null}

      {error ? (
        <p className="notice notice-red" style={{ margin: 0, padding: '8px 12px', fontSize: 13 }}>
          {error}
        </p>
      ) : null}

      <p style={{ margin: 0, fontSize: 12, color: 'var(--dim)' }}>
        This date is shown publicly on the article and drives chronological sorting when present.
      </p>
    </div>
  );
}
