import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest) {
  return NextResponse.json({ error: 'Demo login has been disabled.' }, { status: 404 });
}
