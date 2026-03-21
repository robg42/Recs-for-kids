import { NextRequest, NextResponse } from 'next/server';
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
  if (!adminPassword || password !== adminPassword) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  await initSchema();
  await setAdminCookie();
  return NextResponse.json({ success: true });
}
