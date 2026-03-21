import { NextRequest, NextResponse } from 'next/server';
import { verifyMagicToken, setSessionCookie } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=missing_token', req.url));
  }

  const email = await verifyMagicToken(token);

  if (!email) {
    return NextResponse.redirect(new URL('/login?error=invalid_token', req.url));
  }

  await setSessionCookie(email);
  return NextResponse.redirect(new URL('/', req.url));
}
