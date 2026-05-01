import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { getMediaStoragePath } from '@/lib/server/storage-paths';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathParts } = await params;
  const mediaRoot = getMediaStoragePath();
  const target = path.resolve(mediaRoot, ...pathParts);
  const normalizedRoot = path.resolve(mediaRoot) + path.sep;

  if (!target.startsWith(normalizedRoot)) {
    return NextResponse.json({ error: 'Invalid media path.' }, { status: 400 });
  }

  try {
    const data = await fs.readFile(target);
    const ext = path.extname(target).toLowerCase();
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': MIME_BY_EXT[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Media not found.' }, { status: 404 });
  }
}
