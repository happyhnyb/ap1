import crypto from 'node:crypto';

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

export function createOpaqueToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function sha256Hex(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
