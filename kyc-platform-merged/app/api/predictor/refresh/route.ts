import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { isAdmin } from '@/lib/auth/entitlement';
import { refreshPredictorData } from '@/lib/predictor/refresh';
import { postToMacMini, shouldProxyToMacMini } from '@/lib/server/mac-mini';

export async function POST() {
  const session = await getServerSession();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  try {
    const result = shouldProxyToMacMini()
      ? await postToMacMini('/api/internal/predictor/refresh', {})
      : await refreshPredictorData();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[POST /api/predictor/refresh]', error);
    return NextResponse.json({ error: 'Predictor refresh failed.' }, { status: 500 });
  }
}
