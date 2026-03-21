import { getDb } from '@/lib/db';

const SEED_EMAIL = 'mail@robgregg.com';

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

  // Admin sessions
  await db.execute(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id         TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )
  `);

  // Seed initial admin user if no users exist
  const existing = await db.execute('SELECT COUNT(*) as count FROM users');
  const count = existing.rows[0]?.count ?? 0;
  if (count === 0) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO users (email, invited_by) VALUES (?, ?)',
      args: [SEED_EMAIL, 'system'],
    });
    console.log(`[schema] Seeded initial user: ${SEED_EMAIL}`);
  }
}
