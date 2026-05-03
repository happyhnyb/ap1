'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { isValidStoredImageUrl, normalizeImageSrc, normalizeStoredImageUrl, shouldUnoptimizeImage } from '@/lib/media/url';

interface Props {
  name?: string;
  label?: string;
  initialUrl?: string | null;
}

export function ImageUpload({ name = 'hero_image', label = 'Hero Image', initialUrl }: Props) {
  const [url, setUrl]         = useState(initialUrl ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const inputRef              = useRef<HTMLInputElement>(null);
  const previewSrc            = url ? normalizeImageSrc(url) : '';
  const canPreview            = Boolean(previewSrc) && !previewFailed;

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
      const normalized = normalizeStoredImageUrl(data.url);
      if (!normalized) {
        setUrl('');
        throw new Error('Upload saved but returned an invalid image URL. Please retry or contact admin.');
      }
      setPreviewFailed(false);
      setUrl(normalized);
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
      {canPreview && (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '19 / 9', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border2)', background: 'linear-gradient(135deg, rgba(18,24,16,.95), rgba(28,35,25,.95))' }}>
          <Image
            src={previewSrc}
            alt="Hero preview"
            fill
            style={{ objectFit: 'contain' }}
            unoptimized={shouldUnoptimizeImage(previewSrc)}
            onError={() => {
              setPreviewFailed(true);
              setError('The image URL is saved, but the preview could not be loaded. Please verify the file path or try uploading again.');
            }}
          />
          <button
            type="button"
            onClick={() => {
              setUrl('');
              setPreviewFailed(false);
              setError('');
            }}
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

      {url && !canPreview && (
        <div style={{ padding: '16px 18px', borderRadius: 12, border: '1px solid rgba(220,38,38,.22)', background: 'rgba(220,38,38,.06)', color: 'var(--text)' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Preview unavailable</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {error || 'This image URL is not valid for the CMS preview. Use /api/media/..., /uploads/..., or a valid external image URL.'}
          </div>
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

      <div className="form-group" style={{ margin: 0 }}>
        <input
          className="field"
          value={url}
          onChange={(e) => {
            const nextValue = e.target.value.trim();
            setUrl(nextValue);
            setPreviewFailed(false);
            if (!nextValue) {
              setError('');
              return;
            }

            if (!isValidStoredImageUrl(nextValue)) {
              setError('Please enter a valid image URL or relative /api/media/... path.');
              return;
            }

            if (error) setError('');
          }}
          placeholder="Or paste an image URL or /api/media/... path"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      {error && (
        <p className="notice notice-red" style={{ margin: 0, padding: '8px 12px', fontSize: 13 }}>
          {error}
        </p>
      )}
    </div>
  );
}
