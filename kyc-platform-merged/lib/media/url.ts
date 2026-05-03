import { env } from '@/lib/env';

function candidateOrigins() {
  return [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
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

function isUnsafeLocalPath(value: string) {
  return /^\/(Users|Volumes|private|var|tmp)\//.test(value);
}

function stripKnownOrigin(value: string) {
  for (const origin of candidateOrigins()) {
    if (value.startsWith(`${origin}/api/media/`) || value.startsWith(`${origin}/uploads/`)) {
      return value.slice(origin.length);
    }
  }

  return value;
}

function stripLoopbackOrSameSiteMediaOrigin(value: string) {
  try {
    const parsed = new URL(value);
    if (!/^https?:$/i.test(parsed.protocol)) return value;

    const path = parsed.pathname || '';
    if (!path.startsWith('/api/media/') && !path.startsWith('/uploads/')) return value;

    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
      return `${path}${parsed.search}${parsed.hash}`;
    }

    const normalizedOrigins = new Set(candidateOrigins());
    normalizedOrigins.add('https://kycagri.com');
    normalizedOrigins.add('https://www.kycagri.com');
    if (normalizedOrigins.has(parsed.origin)) {
      return `${path}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return value;
  }

  return value;
}

export function normalizeStoredImageUrl(input: string | null | undefined) {
  const value = input?.trim() ?? '';
  if (!value) return value;

  if (value.startsWith('/')) {
    if (isUnsafeLocalPath(value)) return '';
    if (value.startsWith('/api/media/') || value.startsWith('/uploads/')) return value;
    return value;
  }

  if (/^(file|data|blob|javascript):/i.test(value)) return '';

  if (/^(api\/media|uploads)\//i.test(value)) {
    return `/${value.replace(/^\/+/, '')}`;
  }

  const withoutKnownOrigin = stripKnownOrigin(value);
  if (withoutKnownOrigin !== value) {
    return normalizeStoredImageUrl(withoutKnownOrigin);
  }

  const withoutLoopbackOrSameSiteOrigin = stripLoopbackOrSameSiteMediaOrigin(value);
  if (withoutLoopbackOrSameSiteOrigin !== value) {
    return normalizeStoredImageUrl(withoutLoopbackOrSameSiteOrigin);
  }

  try {
    const parsed = new URL(value);
    if (!/^https?:$/i.test(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function normalizeImageSrc(src: string) {
  return normalizeStoredImageUrl(src);
}

export function isValidStoredImageUrl(input: string | null | undefined) {
  return Boolean(normalizeStoredImageUrl(input));
}

export function shouldUnoptimizeImage(src: string) {
  const normalized = normalizeImageSrc(src);
  return normalized.startsWith('/api/media/') || normalized.startsWith('/uploads/') || normalized.startsWith('/');
}
