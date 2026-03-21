import type { NextRequest } from 'next/server';

/**
 * Extracts a reliable client IP from a Next.js request.
 *
 * Priority:
 * 1. x-real-ip  — set by Vercel's edge layer and most reverse proxies; not spoofable from outside
 * 2. Last value in x-forwarded-for — after trusted proxies the original client IP is the last entry
 * 3. Fallback to 'unknown'
 *
 * Never trust the FIRST x-forwarded-for value — it can be freely set by the client.
 */
export function getClientIp(req: NextRequest): string {
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const last = forwarded.split(',').pop()?.trim();
    if (last) return last;
  }

  return 'unknown';
}
