import { describe, expect, it } from 'vitest';
import { normalizePublishedAtInput, parseNaturalDateInput, toDateInputValue } from '@/lib/posts/publish-date';
import { CreatePostSchema } from '@/lib/validation';

describe('parseNaturalDateInput', () => {
  it('parses common admin date formats', () => {
    expect(parseNaturalDateInput('15 feb 2025')?.dateOnly).toBe('2025-02-15');
    expect(parseNaturalDateInput('15 February 2025')?.dateOnly).toBe('2025-02-15');
    expect(parseNaturalDateInput('Feb 15 2025')?.dateOnly).toBe('2025-02-15');
    expect(parseNaturalDateInput('2025-02-15')?.dateOnly).toBe('2025-02-15');
    expect(parseNaturalDateInput('15/02/2025')?.dateOnly).toBe('2025-02-15');
  });

  it('prefers DD/MM/YYYY for slash dates', () => {
    expect(parseNaturalDateInput('03/02/2025')?.dateOnly).toBe('2025-02-03');
  });

  it('returns null for invalid dates', () => {
    expect(parseNaturalDateInput('31/02/2025')).toBeNull();
  });
});

describe('normalizePublishedAtInput', () => {
  it('stores date-only values at stable midday UTC', () => {
    expect(normalizePublishedAtInput('2025-02-15')).toBe('2025-02-15T12:00:00.000Z');
    expect(toDateInputValue('2025-02-15T12:00:00.000Z')).toBe('2025-02-15');
  });
});

describe('CreatePostSchema date + image normalization', () => {
  it('normalizes published_at and hero_image inputs', () => {
    const result = CreatePostSchema.safeParse({
      title: 'Some valid title here',
      excerpt: 'A meaningful excerpt here.',
      body: 'Body text that is at least twenty chars long.',
      category: 'news',
      type: 'ARTICLE',
      published_at: '15 feb 2025',
      hero_image: 'http://localhost:3000/api/media/2026/05/01/test.webp',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.published_at).toBe('2025-02-15T12:00:00.000Z');
      expect(result.data.hero_image).toBe('/api/media/2026/05/01/test.webp');
    }
  });
});
