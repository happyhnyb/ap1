import { NextRequest, NextResponse } from 'next/server';
import { postsAdapter } from '@/lib/adapters';
import { getServerSession } from '@/lib/auth/jwt';
import { isEditor } from '@/lib/auth/entitlement';
import { parseBody, PatchPostSchema } from '@/lib/validation';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const post = await postsAdapter.getBySlug(slug);
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(post);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession();
  if (!isEditor(session)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseBody(PatchPostSchema, req);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { slug } = await params;
  const updated = await postsAdapter.update(slug, parsed.data);
  if (!updated) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  return NextResponse.json(updated);
}
