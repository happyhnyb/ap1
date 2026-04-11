/**
 * POST /api/upload
 * Accepts a single image file, uploads to R2 (or public/uploads/ in dev).
 * Editors only — requires an active session with editor/admin role.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { isEditor } from '@/lib/auth/entitlement';
import { uploadImage } from '@/lib/storage/r2';

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED  = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!isEditor(session)) {
    return NextResponse.json({ error: 'Editors only.' }, { status: 403 });
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
    const url = await uploadImage(file);
    return NextResponse.json({ url });
  } catch (err) {
    console.error('[upload] Storage error:', err);
    return NextResponse.json({ error: 'Upload failed — check server logs.' }, { status: 500 });
  }
}
