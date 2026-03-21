import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { setAdminCookie } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/ip';
import { initSchema } from '@/lib/schema';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed } = rateLimit(`admin-login:${ip}`, 5, 15 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
  }

  let password: string;
  try {
    const body = await req.json();
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }
  // Constant-time comparison prevents timing side-channel attacks
  const supplied = Buffer.from(password.slice(0, 1024)); // cap to prevent DoS via huge input
  const expected = Buffer.from(adminPassword);
  const match =
    supplied.length === expected.length && timingSafeEqual(supplied, expected);
  if (!match) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  await initSchema();
  await setAdminCookie();
  return NextResponse.json({ success: true });
}
