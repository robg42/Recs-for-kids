import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, clearAdminCookie } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // Clear both the user session and any active admin session
  await clearSessionCookie();
  await clearAdminCookie();
  return NextResponse.redirect(new URL('/login', req.url));
}
