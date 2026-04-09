import { NextRequest, NextResponse } from 'next/server';
import { postsAdapter } from '@/lib/adapters';
import { getServerSession } from '@/lib/auth/jwt';
import { isEditor } from '@/lib/auth/entitlement';

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

  try {
    const body = await req.json() as {
      title: string; excerpt: string; body: string; category: string;
      type: 'SHORT' | 'STORY' | 'ARTICLE'; tags: string[]; is_premium: boolean;
      linked_article_id?: string; status?: 'draft' | 'published';
    };

    // Enforce character limits
    const LIMITS = { SHORT: 1000, STORY: 3000, ARTICLE: 10000 };
    const limit = LIMITS[body.type];
    if (body.body.length > limit) {
      return NextResponse.json({ error: `${body.type} body cannot exceed ${limit} characters.` }, { status: 400 });
    }

    const post = await postsAdapter.create({
      ...body,
      author:    session!.name,
      author_id: session!._id,
    });
    return NextResponse.json(post, { status: 201 });
  } catch (err) {
    console.error('[POST /api/posts]', err);
    return NextResponse.json({ error: 'Failed to create post.' }, { status: 500 });
  }
}
