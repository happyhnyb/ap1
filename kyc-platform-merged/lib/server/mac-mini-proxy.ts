import 'server-only';

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { isNetlifyRuntime, shouldProxyToMacMini } from '@/lib/server/mac-mini';

function getBackendBaseUrl() {
  return (env.MAC_MINI_API_BASE_URL || '').replace(/\/$/, '');
}

async function readIncomingCookieHeader() {
  const store = await cookies();
  return store.getAll().map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

export async function routeShouldProxy() {
  return shouldProxyToMacMini();
}

export function shouldForceMacMiniProxy(req?: NextRequest) {
  if (!shouldProxyToMacMini()) return false;
  const host = req?.headers.get('host') ?? '';
  return Boolean(
    isNetlifyRuntime()
    || host.endsWith('.netlify.app')
  );
}

function rewriteSetCookieForHost(req: NextRequest, setCookie: string) {
  const host = req.headers.get('host') ?? '';
  const configuredDomain = (env.COOKIE_DOMAIN ?? '').replace(/^\./, '').toLowerCase();
  if (!host || !configuredDomain) return setCookie;

  const normalizedHost = host.toLowerCase();
  if (normalizedHost === configuredDomain || normalizedHost.endsWith(`.${configuredDomain}`)) {
    return setCookie;
  }

  return setCookie.replace(/;\s*Domain=[^;]+/gi, '');
}

export async function proxyRouteToMacMini(req: NextRequest, path?: string) {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    throw new Error('MAC_MINI_API_BASE_URL is not configured.');
  }

  const targetUrl = `${baseUrl}${path ?? req.nextUrl.pathname}${req.nextUrl.search}`;
  const headers = new Headers(req.headers);
  headers.set('host', new URL(baseUrl).host);

  const cookieHeader = await readIncomingCookieHeader();
  if (cookieHeader) headers.set('cookie', cookieHeader);

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  // Let fetch recompute framing for forwarded bodies, especially multipart uploads.
  headers.delete('content-length');

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
    cache: 'no-store',
    body,
  };

  const upstream = await fetch(targetUrl, init);
  const bodyText = await upstream.text();
  const response = new NextResponse(bodyText, {
    status: upstream.status,
    headers: upstream.headers,
  });

  const setCookie = upstream.headers.get('set-cookie');
  if (setCookie) {
    response.headers.set('set-cookie', rewriteSetCookieForHost(req, setCookie));
  }

  return response;
}
