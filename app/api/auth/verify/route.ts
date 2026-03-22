import { NextRequest, NextResponse } from 'next/server';
import { verifyMagicToken, consumeMagicToken, setSessionCookie } from '@/lib/auth';
import { getSessionDurationDays } from '@/lib/users';
import { initSchema } from '@/lib/schema';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=missing_token', req.url));
  }

  // Verify JWT signature and expiry first (cheap, no DB hit)
  const email = await verifyMagicToken(token);
  if (!email) {
    return NextResponse.redirect(new URL('/login?error=invalid_token', req.url));
  }

  await initSchema();

  // Atomically mark token as used — rejects if already consumed (replay prevention)
  const consumed = await consumeMagicToken(token);
  if (!consumed) {
    return NextResponse.redirect(new URL('/login?error=invalid_token', req.url));
  }

  // Use the user's preferred session duration (default 30 days, max 365)
  const durationDays = await getSessionDurationDays(email);
  await setSessionCookie(email, durationDays);

  return NextResponse.redirect(new URL('/', req.url));
}
