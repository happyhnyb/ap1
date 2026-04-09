import { NextRequest, NextResponse } from 'next/server';
import { postsAdapter } from '@/lib/adapters';
import { getServerSession } from '@/lib/auth/jwt';
import { isEditor } from '@/lib/auth/entitlement';

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

  const { slug } = await params;
  const patch = await req.json();

  if (patch.body && patch.type) {
    const LIMITS: Record<string, number> = { SHORT: 1000, STORY: 3000, ARTICLE: 10000 };
    const limit = LIMITS[patch.type];
    if (limit && patch.body.length > limit) {
      return NextResponse.json({ error: `${patch.type} body cannot exceed ${limit} characters.` }, { status: 400 });
    }
  }

  const updated = await postsAdapter.update(slug, patch);
  if (!updated) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  return NextResponse.json(updated);
}
