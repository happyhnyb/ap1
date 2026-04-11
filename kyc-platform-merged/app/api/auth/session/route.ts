import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ user: null });
  return NextResponse.json({ user: session });
}
