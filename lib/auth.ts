import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SESSION_COOKIE = 'rfk-session';
const ADMIN_COOKIE = 'rfk-admin';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const ADMIN_MAX_AGE = 60 * 60 * 8;          // 8 hours

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET ?? '';
  if (secret.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters');
  return new TextEncoder().encode(secret);
}

// ── Magic link token (15 min) ────────────────────────────────────────────────

export async function createMagicToken(email: string): Promise<string> {
  return new SignJWT({ email, type: 'magic' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(getSecret());
}

export async function verifyMagicToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.type !== 'magic' || typeof payload.email !== 'string') return null;
    return payload.email;
  } catch {
    return null;
  }
}

// ── User session (30 days) ───────────────────────────────────────────────────

export async function setSessionCookie(email: string): Promise<void> {
  const token = await new SignJWT({ email, type: 'session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

export async function getSession(): Promise<{ email: string } | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.type !== 'session' || typeof payload.email !== 'string') return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// ── Admin session (8 hours) ──────────────────────────────────────────────────

export async function setAdminCookie(): Promise<void> {
  const token = await new SignJWT({ type: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: ADMIN_MAX_AGE,
    path: '/admin',
  });
}

export async function getAdminSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE)?.value;
    if (!token) return false;
    const { payload } = await jwtVerify(token, getSecret());
    return payload.type === 'admin';
  } catch {
    return false;
  }
}

export async function clearAdminCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE);
}
