import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { proxyRouteToMacMini } from '@/lib/server/mac-mini-proxy';
import { getSafeStorageStatus, isValidStoragePath } from '@/lib/server/storage-paths';

export async function GET(req: NextRequest) {
  if (!env.DATABASE_URL && env.MAC_MINI_API_BASE_URL) {
    return proxyRouteToMacMini(req);
  }

  const status = getSafeStorageStatus();
  const rootReady = !status.root || (status.rootExists && isValidStoragePath(status.root));
  const mediaReady = status.mediaExists && isValidStoragePath(status.media);
  const postgresReady = !status.postgres || (status.postgresExists && isValidStoragePath(status.postgres));
  const ok = rootReady && mediaReady && postgresReady;

  return NextResponse.json({
    ok,
    storage: status,
  }, { status: ok ? 200 : 503 });
}
