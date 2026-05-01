/**
 * POST /api/upload
 * Accepts a single image file, uploads to R2 when configured,
 * otherwise writes to MEDIA_STORAGE_PATH on the local server,
 * and proxies to Mac Mini when running on Vercel without local storage.
 * Editors only — requires an active session with editor/admin role.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { isEditor } from '@/lib/auth/entitlement';
import { uploadImage as uploadLocalImage } from '@/lib/storage/local-media';
import { uploadImage as uploadR2Image } from '@/lib/storage/r2';
import { env } from '@/lib/env';
import { shouldProxyToMacMini } from '@/lib/server/mac-mini';
import { proxyRouteToMacMini } from '@/lib/server/mac-mini-proxy';
import path from 'node:path';

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED  = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function hasLocalMediaStorage() {
  const p = env.MEDIA_STORAGE_PATH;
  return !!p && path.isAbsolute(p);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!isEditor(session)) {
    return NextResponse.json({ error: 'Editors only.' }, { status: 403 });
  }

  // No R2 and no local storage configured → proxy to Mac Mini (Vercel deployment).
  // Skip proxying when MEDIA_STORAGE_PATH is set — that means we ARE the storage server.
  if (!env.R2_ENABLED && !hasLocalMediaStorage() && shouldProxyToMacMini()) {
    return proxyRouteToMacMini(req, '/api/upload');
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body.' }, { status: 400 });
  }

  const file = form.get('file') as File | null;
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'Only JPG, PNG, WebP and GIF are allowed.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large — maximum 4 MB.' }, { status: 400 });
  }

  try {
    const url = env.R2_ENABLED
      ? await uploadR2Image(file)
      : await uploadLocalImage(file, session!._id, req.nextUrl.origin);
    return NextResponse.json({ url });
  } catch (err) {
    console.error('[upload] Storage error:', err);
    const message = err instanceof Error ? err.message : 'Upload failed — check server logs.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
