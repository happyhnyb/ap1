import { NextRequest, NextResponse } from 'next/server';
import { pgQuery } from '@/lib/db/pg';
import { env } from '@/lib/env';
import { proxyRouteToMacMini } from '@/lib/server/mac-mini-proxy';

export async function GET(req: NextRequest) {
  if (!env.DATABASE_URL && env.MAC_MINI_API_BASE_URL) {
    return proxyRouteToMacMini(req);
  }

  try {
    await pgQuery('SELECT 1');
    return NextResponse.json({
      ok: true,
      database: 'postgresql',
      configured: true,
      time: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      database: 'postgresql',
      configured: Boolean(env.DATABASE_URL),
      error: error instanceof Error ? error.message : 'Database health check failed.',
    }, { status: 503 });
  }
}
