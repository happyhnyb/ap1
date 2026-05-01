export type PostBodySection =
  | { type: 'paragraph'; content: string }
  | { type: 'heading2'; content: string }
  | { type: 'heading3'; content: string }
  | { type: 'blockquote'; content: string }
  | { type: 'image'; alt: string; src: string };

const IMAGE_PATTERN = /^!\[(.*?)\]\((https?:\/\/\S+|\/\S+)\)$/;

export function parsePostBodySections(body: string): PostBodySection[] {
  const sections: PostBodySection[] = [];
  const paragraphLines: string[] = [];

  function flushParagraph() {
    const content = paragraphLines.join('\n').trim();
    if (content) {
      sections.push({ type: 'paragraph', content });
    }
    paragraphLines.length = 0;
  }

  for (const line of body.split('\n')) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const imageMatch = trimmed.match(IMAGE_PATTERN);
    if (imageMatch) {
      flushParagraph();
      sections.push({
        type: 'image',
        alt: imageMatch[1] || 'Article image',
        src: imageMatch[2],
      });
      continue;
    }

    if (trimmed.startsWith('### ')) {
      flushParagraph();
      sections.push({ type: 'heading3', content: trimmed.slice(4).trim() });
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushParagraph();
      sections.push({ type: 'heading2', content: trimmed.slice(3).trim() });
      continue;
    }

    if (trimmed.startsWith('> ')) {
      flushParagraph();
      sections.push({ type: 'blockquote', content: trimmed.slice(2).trim() });
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();
  return sections;
}
