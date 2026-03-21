import { NextRequest, NextResponse } from 'next/server';
import { createMagicToken } from '@/lib/auth';
import { isUserAllowed } from '@/lib/users';
import { sendMagicLink } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';
import { initSchema } from '@/lib/schema';
import { getClientIp } from '@/lib/ip';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed } = rateLimit(`magic-link:${ip}`, 5, 15 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }

  let email: string;
  try {
    const body = await req.json();
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (!email || !email.includes('@') || email.length > 255) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  await initSchema();

  // Always return success to prevent email enumeration
  const userAllowed = await isUserAllowed(email);
  if (userAllowed) {
    const token = await createMagicToken(email);
    await sendMagicLink(email, token);
  }

  return NextResponse.json({ success: true });
}
