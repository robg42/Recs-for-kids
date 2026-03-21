import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { loadServerCache } from '@/lib/activity-cache';
import { initSchema } from '@/lib/schema';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  try {
    await initSchema();
    const cache = await loadServerCache(session.email);
    if (!cache) {
      return NextResponse.json({ found: false });
    }
    return NextResponse.json({ found: true, ...cache });
  } catch (err) {
    console.error('[activities/cached] Error:', err);
    return NextResponse.json({ found: false });
  }
}
