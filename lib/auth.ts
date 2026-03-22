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

export async function setSessionCookie(email: string, durationDays = 30): Promise<void> {
  // Cap server-side regardless of what's passed
  const safeDays = Math.max(1, Math.min(365, Math.floor(durationDays)));
  const maxAge = safeDays * 24 * 60 * 60;

  const token = await new SignJWT({ email, type: 'session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${safeDays}d`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  });
}

// ── sessions_nbf in-process cache ────────────────────────────────────────────
// Querying the DB on every request to check for a "kill all sessions" timestamp
// adds one Turso round-trip per call.  Cache it in memory for 60 s instead.
let _nbfCache: { value: number | null; fetchedAt: number } | null = null;
const NBF_CACHE_TTL_MS = 60_000;

async function getSessionsNbf(): Promise<number | null> {
  if (_nbfCache && Date.now() - _nbfCache.fetchedAt < NBF_CACHE_TTL_MS) {
    return _nbfCache.value;
  }
  try {
    const db = getDb();
    const row = await db.execute({
      sql: "SELECT value FROM settings WHERE key = 'sessions_nbf' LIMIT 1",
      args: [],
    });
    const value =
      row.rows.length > 0
        ? new Date(row.rows[0].value as string).getTime()
        : null;
    _nbfCache = { value, fetchedAt: Date.now() };
    return value;
  } catch {
    return null; // Settings table not yet created — allow session
  }
}

export async function getSession(): Promise<{ email: string } | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.type !== 'session' || typeof payload.email !== 'string') return null;

    // Check global invalidation timestamp (cached 60 s to avoid per-request DB hit)
    const nbf = await getSessionsNbf();
    if (nbf !== null && (payload.iat ?? 0) * 1000 < nbf) return null;

    return { email: payload.email };
  } catch {
    return null;
  }
}

/** Call after invalidateAllSessions() so the cache reflects the new timestamp immediately. */
export function clearNbfCache(): void {
  _nbfCache = null;
}

export async function invalidateAllSessions(): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "INSERT OR REPLACE INTO settings (key, value) VALUES ('sessions_nbf', ?)",
    args: [new Date().toISOString()],
  });
  clearNbfCache(); // ensure next getSession() picks up the new timestamp immediately
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
