import { describe, expect, it } from 'vitest';
import { normalizeStoredImageUrl } from '@/lib/media/url';

describe('normalizeStoredImageUrl', () => {
  it('converts localhost media URLs to relative paths', () => {
    expect(normalizeStoredImageUrl('http://localhost:3000/api/media/2026/05/01/test.webp')).toBe('/api/media/2026/05/01/test.webp');
    expect(normalizeStoredImageUrl('https://localhost:3000/api/media/2026/05/02/test.jpg')).toBe('/api/media/2026/05/02/test.jpg');
    expect(normalizeStoredImageUrl('http://127.0.0.1:3000/api/media/a.jpg')).toBe('/api/media/a.jpg');
  });

  it('converts production same-site media URLs to relative paths', () => {
    expect(normalizeStoredImageUrl('https://kycagri.com/api/media/path/image.png')).toBe('/api/media/path/image.png');
  });

  it('keeps valid external CDN URLs absolute', () => {
    expect(normalizeStoredImageUrl('https://cdn.example.com/images/hero.webp')).toBe('https://cdn.example.com/images/hero.webp');
  });

  it('rejects unsafe protocols and leaked filesystem paths', () => {
    expect(normalizeStoredImageUrl('file:///Users/test/Desktop/image.jpg')).toBe('');
    expect(normalizeStoredImageUrl('javascript:alert(1)')).toBe('');
    expect(normalizeStoredImageUrl('/Users/test/Desktop/image.jpg')).toBe('');
  });
});
