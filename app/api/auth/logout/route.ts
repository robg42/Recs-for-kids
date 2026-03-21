import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, clearAdminCookie } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(_req: NextRequest) {
  // Clear both the user session and any active admin session
  await clearSessionCookie();
  await clearAdminCookie();
  // Use the configured app URL rather than req.url to avoid open redirect
  // via a spoofed Host header in misconfigured proxy environments
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://adventures.robgregg.com';
  return NextResponse.redirect(new URL('/login', appUrl));
}
