import path from 'node:path';
import { createId } from '@/lib/db/ids';
import { pgQuery } from '@/lib/db/pg';
import { buildMediaObjectPath } from '@/lib/server/storage-paths';

export async function createMediaRecord(input: {
  fileName: string;
  publicUrl: string;
  mimeType: string;
  byteSize: number;
  uploadedBy?: string | null;
}) {
  const id = createId('med');
  const storageKey = path.basename(buildMediaObjectPath(input.fileName));
  await pgQuery(
    `INSERT INTO media_files (id, filename, storage_key, public_url, mime_type, byte_size, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, input.fileName, storageKey, input.publicUrl, input.mimeType, input.byteSize, input.uploadedBy ?? null]
  );
  return { id, storageKey };
}
