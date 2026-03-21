import { NextResponse } from 'next/server';
import { getSession, invalidateAllSessions } from '@/lib/auth';
import { isUserAdmin } from '@/lib/users';
import { initSchema } from '@/lib/schema';

export const runtime = 'nodejs';

export async function POST() {
  await initSchema();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const admin = await isUserAdmin(session.email);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await invalidateAllSessions();
  return NextResponse.json({ success: true });
}
