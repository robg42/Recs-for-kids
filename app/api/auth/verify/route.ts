import { NextRequest, NextResponse } from 'next/server';
import { verifyMagicToken, consumeMagicToken, setSessionCookie } from '@/lib/auth';
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

  // Atomically mark token as used — rejects if already consumed
  const consumed = await consumeMagicToken(token);
  if (!consumed) {
    return NextResponse.redirect(new URL('/login?error=invalid_token', req.url));
  }

  await setSessionCookie(email);
  return NextResponse.redirect(new URL('/', req.url));
}
