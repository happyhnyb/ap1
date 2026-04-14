import { NextResponse } from 'next/server';
import { getEffectiveServerSession } from '@/lib/auth/current-user';

export async function GET() {
  const session = await getEffectiveServerSession();
  if (!session) return NextResponse.json({ user: null });
  return NextResponse.json({ user: session });
}
