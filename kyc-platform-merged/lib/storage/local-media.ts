import 'server-only';

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createMediaRecord } from '@/lib/db/repositories/media';
import { isPostgresConfigured } from '@/lib/db/pg';
import { buildMediaObjectPath, getMediaStoragePath } from '@/lib/server/storage-paths';
import { env } from '@/lib/env';

const ALLOWED = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

function buildSafeFileName(file: File) {
  const ext = ALLOWED.get(file.type) || path.extname(file.name).toLowerCase() || '.bin';
  return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
}

/** True when MEDIA_STORAGE_PATH is set to any absolute path. */
function hasLocalMediaStorage() {
  const media = getMediaStoragePath();
  return !!media && path.isAbsolute(media);
}

export async function uploadImage(file: File, uploadedBy?: string | null): Promise<string> {
  const fileName = buildSafeFileName(file);
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  if (hasLocalMediaStorage()) {
    const targetPath = buildMediaObjectPath(fileName);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, buffer);

    const mediaRoot = getMediaStoragePath();
    const relativePath = path.relative(mediaRoot, targetPath).split(path.sep).join('/');
    const publicUrl = `/api/media/${relativePath}`;

    if (isPostgresConfigured()) {
      try {
        await createMediaRecord({
          fileName,
          publicUrl,
          mimeType: file.type,
          byteSize: file.size,
          uploadedBy: uploadedBy ?? null,
        });
      } catch (error) {
        console.error('[uploadImage] media record creation failed; continuing with uploaded file', error);
      }
    }

    return publicUrl;
  }

  if (env.IS_PROD) {
    throw new Error('MEDIA_STORAGE_PATH is not configured. Set it to an absolute path on the server.');
  }

  // Dev fallback — write to public/uploads/
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, fileName), buffer);
  return `/uploads/${fileName}`;
}

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/**
 * Imports a file referenced by a `file://` URL into local media storage and
 * returns the public `/api/media/...` URL. Returns null if the URL isn't a
 * usable file path or the source file can't be read.
 */
export async function importLocalFileUrl(fileUrl: string, uploadedBy?: string | null): Promise<string | null> {
  let sourcePath: string;
  try {
    const url = new URL(fileUrl);
    if (url.protocol !== 'file:') return null;
    sourcePath = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  const ext = path.extname(sourcePath).toLowerCase();
  const mime = EXT_TO_MIME[ext];
  if (!mime) return null;

  if (!getMediaStoragePath()) return null;

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(sourcePath);
  } catch {
    return null;
  }

  const fileName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const targetPath = buildMediaObjectPath(fileName);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, buffer);

  const mediaRoot = getMediaStoragePath();
  const relativePath = path.relative(mediaRoot, targetPath).split(path.sep).join('/');
  const publicUrl = `/api/media/${relativePath}`;

  if (isPostgresConfigured()) {
    try {
      await createMediaRecord({
        fileName,
        publicUrl,
        mimeType: mime,
        byteSize: buffer.byteLength,
        uploadedBy: uploadedBy ?? null,
      });
    } catch (error) {
      console.error('[importLocalFileUrl] media record creation failed; continuing with imported file', error);
    }
  }

  return publicUrl;
}
