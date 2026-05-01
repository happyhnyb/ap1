import fs from 'node:fs';
import path from 'node:path';
import { env } from '@/lib/env';

function normalizeDir(input: string) {
  return input.replace(/\/+$/, '');
}

export function getStorageRoot() {
  return normalizeDir(env.KYC_STORAGE_ROOT || '');
}

export function getMediaStoragePath() {
  return normalizeDir(env.MEDIA_STORAGE_PATH || '');
}

export function getPostgresDataPath() {
  return normalizeDir(env.POSTGRES_DATA_PATH || '');
}

/** Returns true for any non-empty absolute path — no longer restricted to /Volumes/. */
export function isValidStoragePath(target: string) {
  return !!target && path.isAbsolute(target);
}

/** @deprecated Use isValidStoragePath — kept for monitoring display compatibility. */
export function isAbsoluteVolumePath(target: string) {
  return isValidStoragePath(target);
}

export function ensureDirectoryExists(target: string) {
  if (!target) {
    throw new Error('Storage path is not configured.');
  }
  if (!fs.existsSync(target)) {
    throw new Error(`Required storage path does not exist: ${target}`);
  }
}

export function assertExternalStorageReady() {
  const media = getMediaStoragePath();

  if (!media || !isValidStoragePath(media)) {
    throw new Error('MEDIA_STORAGE_PATH is not configured. Set it to an absolute directory path.');
  }

  ensureDirectoryExists(media);
}

export function getSafeStorageStatus() {
  const root = getStorageRoot();
  const media = getMediaStoragePath();
  const postgres = getPostgresDataPath();

  return {
    root,
    media,
    postgres,
    rootExists: !!root && fs.existsSync(root),
    mediaExists: !!media && fs.existsSync(media),
    postgresExists: !!postgres && fs.existsSync(postgres),
    rootUnderVolumes: !!root && root.startsWith('/Volumes/'),
    mediaUnderVolumes: !!media && media.startsWith('/Volumes/'),
    postgresUnderVolumes: !!postgres && postgres.startsWith('/Volumes/'),
  };
}

export function buildMediaObjectPath(fileName: string) {
  const now = new Date();
  const parts = [
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    fileName,
  ];
  return path.join(getMediaStoragePath(), ...parts);
}
