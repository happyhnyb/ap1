import { env } from '@/lib/env';

function candidateOrigins() {
  return [
    env.BASE_URL,
    env.APP_BASE_URL,
    env.API_BASE_URL,
    env.MAC_MINI_API_BASE_URL,
    'https://kycagri.com',
    'https://www.kycagri.com',
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/\/$/, ''));
}

export function normalizeImageSrc(src: string) {
  const value = src.trim();
  if (!value || value.startsWith('/')) return value;

  for (const origin of candidateOrigins()) {
    if (value.startsWith(`${origin}/api/media/`) || value.startsWith(`${origin}/uploads/`)) {
      return value.slice(origin.length);
    }
  }

  return value;
}

export function shouldUnoptimizeImage(src: string) {
  const normalized = normalizeImageSrc(src);
  return normalized.startsWith('/api/media/') || normalized.startsWith('/uploads/') || normalized.startsWith('/');
}
