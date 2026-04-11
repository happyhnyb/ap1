'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';

interface Props {
  name?: string;
  label?: string;
  initialUrl?: string | null;
}

export function ImageUpload({ name = 'hero_image', label = 'Hero Image', initialUrl }: Props) {
  const [url, setUrl]         = useState(initialUrl ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const inputRef              = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');

    const fd = new FormData();
    fd.append('file', file);

    try {
      const res  = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setUrl(data.url!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
      // reset so the same file can be re-selected if needed
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label className="form-label">{label} <span style={{ color: 'var(--dim)', fontWeight: 400 }}>(optional)</span></label>

      {/* Hidden field that the server action reads */}
      <input type="hidden" name={name} value={url} />

      {/* Preview */}
      {url && (
        <div style={{ position: 'relative', width: '100%', height: 180, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border2)' }}>
          <Image src={url} alt="Hero preview" fill style={{ objectFit: 'cover' }} unoptimized={url.startsWith('/')} />
          <button
            type="button"
            onClick={() => setUrl('')}
            style={{
              position: 'absolute', top: 8, right: 8,
              background: 'rgba(9,11,7,.8)', border: '1px solid var(--border2)',
              color: 'var(--text)', borderRadius: 6, padding: '4px 10px',
              cursor: 'pointer', fontSize: 12,
            }}
          >
            ✕ Remove
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          style={{ opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Uploading…' : url ? '↻ Change image' : '↑ Upload image'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
        {!url && !loading && (
          <span style={{ fontSize: 12, color: 'var(--dim)' }}>JPG, PNG, WebP, GIF · max 4 MB</span>
        )}
      </div>

      {error && (
        <p className="notice notice-red" style={{ margin: 0, padding: '8px 12px', fontSize: 13 }}>
          {error}
        </p>
      )}
    </div>
  );
}
