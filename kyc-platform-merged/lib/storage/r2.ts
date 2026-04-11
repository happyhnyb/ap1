/**
 * Image storage helper.
 * Uploads to Cloudflare R2 when configured; falls back to public/uploads/ in dev.
 */
import { env } from '@/lib/env';
import path from 'path';
import { writeFile, mkdir } from 'fs/promises';

function generateKey(file: File): string {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `uploads/${ts}-${rand}.${ext}`;
}

export async function uploadImage(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const key = generateKey(file);

  // ── Cloudflare R2 ──────────────────────────────────────────────
  if (env.R2_ENABLED) {
    // Dynamic import so TypeScript doesn't require the package at compile time when R2 is off
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region: 'auto',
      endpoint: env.R2_ENDPOINT,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    await client.send(new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      CacheControl: 'public, max-age=31536000, immutable',
    }));

    const publicBase = env.R2_PUBLIC_URL || `${env.R2_ENDPOINT}/${env.R2_BUCKET}`;
    return `${publicBase.replace(/\/$/, '')}/${key}`;
  }

  // ── Dev fallback: write to public/uploads/ ─────────────────────
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  await mkdir(uploadsDir, { recursive: true });
  const filename = key.replace('uploads/', '');
  await writeFile(path.join(uploadsDir, filename), buffer);
  return `/uploads/${filename}`;
}
