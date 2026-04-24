import 'server-only';

import { env } from '@/lib/env';

function getMacMiniBaseUrl() {
  return env.MAC_MINI_API_BASE_URL.replace(/\/$/, '');
}

export function shouldProxyToMacMini() {
  return Boolean(getMacMiniBaseUrl());
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  return await res.json().catch(() => ({} as T));
}

function buildInternalHeaders() {
  if (!env.INTERNAL_API_KEY) {
    throw new Error('INTERNAL_API_KEY is not configured.');
  }

  return {
    'Content-Type': 'application/json',
    'x-internal-api-key': env.INTERNAL_API_KEY,
  };
}

export async function postToMacMini<T>(path: string, body: unknown): Promise<T> {
  const baseUrl = getMacMiniBaseUrl();
  if (!baseUrl) {
    throw new Error('MAC_MINI_API_BASE_URL is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: buildInternalHeaders(),
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });

    const data = await parseJsonResponse<{ error?: string } & T>(res);
    if (!res.ok) {
      const message = typeof data?.error === 'string' ? data.error : `Mac Mini request failed (${res.status}).`;
      throw new Error(message);
    }

    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getFromMacMini<T>(path: string): Promise<T> {
  const baseUrl = getMacMiniBaseUrl();
  if (!baseUrl) {
    throw new Error('MAC_MINI_API_BASE_URL is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      headers: buildInternalHeaders(),
      cache: 'no-store',
      signal: controller.signal,
    });

    const data = await parseJsonResponse<{ error?: string } & T>(res);
    if (!res.ok) {
      const message = typeof data?.error === 'string' ? data.error : `Mac Mini request failed (${res.status}).`;
      throw new Error(message);
    }

    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}
