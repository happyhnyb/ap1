import { NextRequest, NextResponse } from 'next/server';
import { invokeAITool } from '@/lib/ai/tools';
import { getServerSession } from '@/lib/auth/jwt';
import { hasFreshPremiumAccess, premiumAIAccessError } from '@/lib/auth/premium-access';

export async function GET(req: NextRequest, context: { params: Promise<{ tool: string }> }) {
  const session = await getServerSession();
  if (!(await hasFreshPremiumAccess(session, 'GET /api/ai/tools/[tool]'))) {
    return NextResponse.json({ error: premiumAIAccessError(session) }, { status: session ? 403 : 401 });
  }

  const { tool } = await context.params;
  const args = Object.fromEntries(req.nextUrl.searchParams.entries());

  try {
    const result = await invokeAITool(tool.replace(/-/g, '_'), args);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/ai/tools/[tool]]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Tool invocation failed.' }, { status: 400 });
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ tool: string }> }) {
  const session = await getServerSession();
  if (!(await hasFreshPremiumAccess(session, 'POST /api/ai/tools/[tool]'))) {
    return NextResponse.json({ error: premiumAIAccessError(session) }, { status: session ? 403 : 401 });
  }

  const { tool } = await context.params;
  try {
    const body = await req.json();
    const result = await invokeAITool(tool.replace(/-/g, '_'), body);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[POST /api/ai/tools/[tool]]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Tool invocation failed.' }, { status: 400 });
  }
}
