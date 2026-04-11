import { NextRequest, NextResponse } from 'next/server';
import { postsAdapter } from '@/lib/adapters';
import { getServerSession } from '@/lib/auth/jwt';
import { isEditor } from '@/lib/auth/entitlement';
import { parseBody, CreatePostSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const all = searchParams.get('all') === 'true';

  const session = await getServerSession();
  if (all && !isEditor(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const posts = all ? await postsAdapter.listAll() : await postsAdapter.listPublished();
  return NextResponse.json(posts);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!isEditor(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await parseBody(CreatePostSchema, req);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const post = await postsAdapter.create({
      ...parsed.data,
      author:    session!.name,
      author_id: session!._id,
    });
    return NextResponse.json(post, { status: 201 });
  } catch (err) {
    console.error('[POST /api/posts]', err);
    return NextResponse.json({ error: 'Failed to create post.' }, { status: 500 });
  }
}
