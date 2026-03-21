import { NextRequest, NextResponse } from 'next/server';
import { createMagicToken } from '@/lib/auth';
import { isUserAllowed } from '@/lib/users';
import { sendMagicLink } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';
import { initSchema } from '@/lib/schema';
import { getClientIp } from '@/lib/ip';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
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

    console.log('[auth/request] step: initSchema');
    await initSchema();

    console.log('[auth/request] step: isUserAllowed');
    // Always return success to prevent email enumeration
    const userAllowed = await isUserAllowed(email);
    if (userAllowed) {
      console.log('[auth/request] step: createMagicToken');
      const token = await createMagicToken(email);
      console.log('[auth/request] step: sendMagicLink');
      await sendMagicLink(email, token);
    }

    console.log('[auth/request] step: success');
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[auth/request] CRASH at step:', (err as Error)?.message ?? String(err), err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
