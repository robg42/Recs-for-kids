/**
 * /api/settings
 *
 * GET  — return the current user's settings (session duration, etc.)
 * POST — update settings for the current user
 *
 * Security: all reads/writes are scoped to session.email from getSession().
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSessionDurationDays, setSessionDurationDays } from '@/lib/users';
import { initSchema } from '@/lib/schema';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  await initSchema();
  const sessionDays = await getSessionDurationDays(session.email);
  return NextResponse.json({ sessionDays });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { sessionDays } = body as Record<string, unknown>;

  if (sessionDays !== undefined) {
    if (typeof sessionDays !== 'number' || !isFinite(sessionDays)) {
      return NextResponse.json({ error: 'Invalid sessionDays' }, { status: 400 });
    }
    await initSchema();
    await setSessionDurationDays(session.email, sessionDays);
  }

  return NextResponse.json({ ok: true });
}
