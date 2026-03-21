import { getDb } from '@/lib/db';

const SEED_EMAIL = process.env.SEED_EMAIL ?? 'mail@robgregg.com';

export async function initSchema(): Promise<void> {
  const db = getDb();

  // Users table — invite-only access list
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      email     TEXT NOT NULL UNIQUE COLLATE NOCASE,
      invited_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

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

  // Seed initial admin user if no users exist
  const existing = await db.execute('SELECT COUNT(*) as count FROM users');
  const count = existing.rows[0]?.count ?? 0;
  if (count === 0) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO users (email, invited_by) VALUES (?, ?)',
      args: [SEED_EMAIL, 'system'],
    });
  }
}
