import { normalizeImageSrc } from '@/lib/media/url';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripDuplicateHeroImage(body: string, heroImage: string | null | undefined) {
  const normalizedHero = heroImage ? normalizeImageSrc(heroImage).trim() : '';
  if (!normalizedHero) return body;

  const pattern = new RegExp(
    String.raw`\n{0,2}!\[[^\]]*\]\(${escapeRegExp(normalizedHero)}\)\s*$`,
    'i',
  );

  return body.replace(pattern, '').trimEnd();
}
