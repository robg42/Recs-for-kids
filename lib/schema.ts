import { getDb } from '@/lib/db';

const SEED_EMAIL = process.env.SEED_EMAIL ?? 'mail@robgregg.com';
const SEED_USER_2 = 'stephsherry82@gmail.com';

export async function initSchema(): Promise<void> {
  const db = getDb();

  // Users table — invite-only access list
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      invited_by    TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      children_json TEXT,
      is_admin      INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Migrate existing databases that predate these columns
  await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS children_json TEXT`);
  await db.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin INTEGER NOT NULL DEFAULT 0`);

  // Admin sessions — DB-backed so they are revocable
  await db.execute(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id         TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )
  `);

  // Single-use magic link token hashes (SHA-256 of the raw JWT)
  // Prevents replay of a magic link that was already consumed
  await db.execute(`
    CREATE TABLE IF NOT EXISTS magic_tokens (
      token_hash TEXT PRIMARY KEY,
      used_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Clean up token hashes older than 1 hour — tokens expire after 15 min so
  // these rows serve no security purpose and would otherwise grow indefinitely
  await db.execute(
    "DELETE FROM magic_tokens WHERE used_at < datetime('now', '-1 hour')"
  );

  // Key/value settings store — used for session invalidation timestamp etc.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Server-side activity cache — survives browser/device changes, enables prefetch
  await db.execute(`
    CREATE TABLE IF NOT EXISTS activity_cache (
      email      TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      cached_at  INTEGER NOT NULL
    )
  `);

  // Ensure primary admin user always exists and has admin role
  await db.execute({
    sql: 'INSERT OR IGNORE INTO users (email, invited_by, is_admin) VALUES (?, ?, 1)',
    args: [SEED_EMAIL, 'system'],
  });
  await db.execute({
    sql: 'UPDATE users SET is_admin = 1 WHERE email = ? COLLATE NOCASE',
    args: [SEED_EMAIL],
  });

  // Seed secondary user
  await db.execute({
    sql: 'INSERT OR IGNORE INTO users (email, invited_by, is_admin) VALUES (?, ?, 0)',
    args: [SEED_USER_2, 'system'],
  });
}
