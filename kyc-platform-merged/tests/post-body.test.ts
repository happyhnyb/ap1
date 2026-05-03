import { describe, expect, it } from 'vitest';
import { parsePostBodySections } from '@/lib/posts/body';

describe('parsePostBodySections', () => {
  it('keeps inline image markdown as a standalone image section without requiring blank lines', () => {
    const body = [
      'Opening paragraph.',
      '![Market arrivals chart](/api/media/2026/05/01/chart.png)',
      'Closing paragraph.',
    ].join('\n');

    expect(parsePostBodySections(body)).toEqual([
      { type: 'paragraph', content: 'Opening paragraph.' },
      { type: 'image', alt: 'Market arrivals chart', src: '/api/media/2026/05/01/chart.png' },
      { type: 'paragraph', content: 'Closing paragraph.' },
    ]);
  });

  it('parses headings, quotes, and paragraphs in order', () => {
    const body = [
      '## Market view',
      '',
      'Paragraph one.',
      '',
      '> Procurement stayed firm.',
      '',
      '### What to watch',
      'Paragraph two.',
    ].join('\n');

    expect(parsePostBodySections(body)).toEqual([
      { type: 'heading2', content: 'Market view' },
      { type: 'paragraph', content: 'Paragraph one.' },
      { type: 'blockquote', content: 'Procurement stayed firm.' },
      { type: 'heading3', content: 'What to watch' },
      { type: 'paragraph', content: 'Paragraph two.' },
    ]);
  });
});
