import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { createHash } from 'crypto';

const SESSION_COOKIE = 'rfk-session';
const ADMIN_COOKIE = 'rfk-admin';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const ADMIN_MAX_AGE = 60 * 60 * 8;          // 8 hours

// Exported so middleware.ts can import a single, validated copy
export function getSecret(): Uint8Array {
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

// Mark a magic link token as used. Returns false if already consumed.
export async function consumeMagicToken(token: string): Promise<boolean> {
  const hash = createHash('sha256').update(token).digest('hex');
  const db = getDb();
  try {
    // This will throw on duplicate primary key if already used
    await db.execute({
      sql: 'INSERT INTO magic_tokens (token_hash) VALUES (?)',
      args: [hash],
    });
    return true;
  } catch {
    return false; // Already consumed
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

    // Check if session was issued before the global invalidation timestamp.
    // Wrapped in its own try-catch: if the settings table doesn't exist yet
    // (before initSchema() has run), we allow the session rather than failing.
    try {
      const db = getDb();
      const row = await db.execute({
        sql: "SELECT value FROM settings WHERE key = 'sessions_nbf' LIMIT 1",
        args: [],
      });
      if (row.rows.length > 0) {
        const nbf = new Date(row.rows[0].value as string).getTime();
        const iat = (payload.iat ?? 0) * 1000;
        if (iat < nbf) return null; // Issued before kill-all — treat as expired
      }
    } catch {
      // Settings table not yet created — allow session
    }

    return { email: payload.email };
  } catch {
    return null;
  }
}

export async function invalidateAllSessions(): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('sessions_nbf', ?)",
    args: [new Date().toISOString()],
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// ── Admin session (8 hours, DB-backed for revocability) ─────────────────────

export async function setAdminCookie(): Promise<void> {
  const sessionId = crypto.randomUUID();
  const db = getDb();

  // Persist session so it can be revoked server-side
  await db.execute({
    sql: "INSERT INTO admin_sessions (id, expires_at) VALUES (?, datetime('now', '+8 hours'))",
    args: [sessionId],
  });

  const token = await new SignJWT({ type: 'admin', sid: sessionId })
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
    if (payload.type !== 'admin' || typeof payload.sid !== 'string') return false;

    // Verify the session still exists in the DB (allows server-side revocation)
    const db = getDb();
    const result = await db.execute({
      sql: "SELECT id FROM admin_sessions WHERE id = ? AND expires_at > datetime('now')",
      args: [payload.sid],
    });
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

export async function clearAdminCookie(): Promise<void> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE)?.value;
    if (token) {
      const { payload } = await jwtVerify(token, getSecret());
      if (typeof payload.sid === 'string') {
        const db = getDb();
        await db.execute({
          sql: 'DELETE FROM admin_sessions WHERE id = ?',
          args: [payload.sid],
        });
      }
    }
  } catch {
    // Ignore errors during logout — always clear the cookie
  }
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE);
}
