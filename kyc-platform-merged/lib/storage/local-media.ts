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

export async function uploadImage(file: File, uploadedBy?: string | null, publicBaseUrl?: string | null): Promise<string> {
  const fileName = buildSafeFileName(file);
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  if (hasLocalMediaStorage()) {
    const targetPath = buildMediaObjectPath(fileName);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, buffer);

    const mediaRoot = getMediaStoragePath();
    const relativePath = path.relative(mediaRoot, targetPath).split(path.sep).join('/');
    const publicBase = (publicBaseUrl || env.MAC_MINI_API_BASE_URL || env.API_BASE_URL || env.APP_BASE_URL || '').replace(/\/$/, '');
    const publicUrl = publicBase ? `${publicBase}/api/media/${relativePath}` : `/api/media/${relativePath}`;

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
