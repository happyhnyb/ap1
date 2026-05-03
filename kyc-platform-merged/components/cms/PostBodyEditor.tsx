'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { normalizeImageSrc, shouldUnoptimizeImage } from '@/lib/media/url';

type Props = {
  name?: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  heroImageUrl?: string | null;
};

function buildImageMarkdown(url: string, fileName: string) {
  const alt = fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Article image';
  return `![${alt}](${url})`;
}

export function PostBodyEditor({
  name = 'body',
  label = 'Body * (use ## for section headings and ![caption](image-url) for inline images)',
  defaultValue = '',
  placeholder = 'Article body. Use ## H2, ### H3, > for quotes, and ![Caption](/api/media/...).',
  rows = 12,
  heroImageUrl,
}: Props) {
  const [value, setValue] = useState(defaultValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const heroPreviewSrc = heroImageUrl ? normalizeImageSrc(heroImageUrl) : '';
  const hasExistingArticle = defaultValue.trim().length > 0;

  useEffect(() => {
    setValue(defaultValue);
    setError('');
  }, [defaultValue]);

  async function handleInlineImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error || 'Image upload failed.');
      }

      const textarea = textareaRef.current;
      const markdown = buildImageMarkdown(data.url, file.name);
      const currentValue = textarea?.value ?? value;
      const selectionStart = textarea?.selectionStart ?? currentValue.length;
      const selectionEnd = textarea?.selectionEnd ?? currentValue.length;
      const needsLeadingBreak = selectionStart > 0 && !currentValue.slice(0, selectionStart).endsWith('\n\n');
      const needsTrailingBreak = selectionEnd < currentValue.length && !currentValue.slice(selectionEnd).startsWith('\n\n');
      const insertion = `${needsLeadingBreak ? '\n\n' : ''}${markdown}${needsTrailingBreak ? '\n\n' : ''}`;
      const nextValue = `${currentValue.slice(0, selectionStart)}${insertion}${currentValue.slice(selectionEnd)}`;

      setValue(nextValue);

      requestAnimationFrame(() => {
        const nextCursor = selectionStart + insertion.length;
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
      });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Image upload failed.');
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  return (
    <div className="form-group">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <label className="form-label" style={{ marginBottom: 0 }}>{label}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            style={{ opacity: loading ? 0.6 : 1, fontSize: 12 }}
          >
            {loading ? 'Uploading image…' : 'Upload inline image'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleInlineImageUpload}
            style={{ display: 'none' }}
          />
          <span style={{ fontSize: 12, color: 'var(--dim)' }}>Uploads and inserts markdown at your cursor</span>
        </div>
      </div>

      {heroPreviewSrc ? (
        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--dim)' }}>Current hero image</span>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '19 / 9', overflow: 'hidden', borderRadius: 16, border: '1px solid var(--border2)', background: 'linear-gradient(135deg, rgba(18,24,16,.95), rgba(28,35,25,.95))' }}>
            <Image
              src={heroPreviewSrc}
              alt="Current hero image"
              fill
              style={{ objectFit: 'contain' }}
              unoptimized={shouldUnoptimizeImage(heroPreviewSrc)}
            />
          </div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: hasExistingArticle ? 'repeat(auto-fit, minmax(280px, 1fr))' : 'minmax(0, 1fr)' }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--dim)', fontWeight: 600 }}>
            {hasExistingArticle ? 'Edit this version' : 'Article body'}
          </div>
          <textarea
            ref={textareaRef}
            className="textarea"
            name={name}
            rows={rows}
            placeholder={placeholder}
            required
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError('');
            }}
          />
        </div>

        {hasExistingArticle ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--dim)', fontWeight: 600 }}>Current saved article</div>
            <textarea
              className="textarea"
              rows={rows}
              value={defaultValue}
              readOnly
              aria-label="Current saved article"
              style={{ background: 'var(--bg2)', color: 'var(--muted)' }}
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="notice notice-red" style={{ margin: '8px 0 0', padding: '8px 12px', fontSize: 13 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
