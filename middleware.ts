import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC_PATHS = ['/login', '/api/auth'];

// Inline getSecret here — middleware runs on Edge, cannot import Node-only lib/auth.ts
// The validation logic must be kept in sync with lib/auth.ts:getSecret()
function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET ?? '';
  if (secret.length < 32) {
    // In production this causes all requests to redirect to /login, making misconfiguration obvious
    throw new Error('AUTH_SECRET must be at least 32 characters');
  }
  return new TextEncoder().encode(secret);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths and static assets
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get('rfk-session')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    await jwtVerify(token, getSecret());
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL('/login', req.url));
    res.cookies.delete('rfk-session');
    return res;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
