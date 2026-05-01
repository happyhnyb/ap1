import { NextRequest, NextResponse } from 'next/server';
import { postsAdapter } from '@/lib/adapters';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  await postsAdapter.incrementViews(slug);
  return NextResponse.json({ ok: true });
}
