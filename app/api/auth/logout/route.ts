import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST() {
  await clearSessionCookie();
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'));
}
