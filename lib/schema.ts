import { getDb } from '@/lib/db';

const SEED_EMAIL  = process.env.SEED_EMAIL  ?? 'mail@robgregg.com';
const SEED_USER_2 = process.env.SEED_USER_2 ?? '';

/**
 * In-process promise cache — schema DDL runs at most once per process
 * instance (serverless warm reuse).  Concurrent calls during a cold-start
 * wait on the same promise instead of firing duplicate DDL.
 */
let _initPromise: Promise<void> | null = null;

export function initSchema(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = _runInitSchema().catch((err) => {
    // Reset so the next request can retry after a transient DB failure
    _initPromise = null;
    throw err;
  });
  return _initPromise;
}

async function _runInitSchema(): Promise<void> {
  const db = getDb();

  // ── Users ─────────────────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      email                TEXT NOT NULL UNIQUE COLLATE NOCASE,
      invited_by           TEXT,
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      children_json        TEXT,
      is_admin             INTEGER NOT NULL DEFAULT 0,
      session_duration_days INTEGER NOT NULL DEFAULT 30
    )
  `);

  // Migrations for pre-existing databases
  try { await db.execute(`ALTER TABLE users ADD COLUMN children_json TEXT`); } catch { /* already exists */ }
  try { await db.execute(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`); } catch { /* already exists */ }
  try { await db.execute(`ALTER TABLE users ADD COLUMN session_duration_days INTEGER NOT NULL DEFAULT 30`); } catch { /* already exists */ }

  // ── Admin sessions ────────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id         TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )
  `);

  // ── Magic link token hashes ───────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS magic_tokens (
      token_hash TEXT PRIMARY KEY,
      used_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  // Prune token hashes older than 1 hour
  await db.execute(
    "DELETE FROM magic_tokens WHERE used_at < datetime('now', '-1 hour')"
  );

  // ── Key/value settings ────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // ── Per-user activity cache ───────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS activity_cache (
      email      TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      cached_at  INTEGER NOT NULL
    )
  `);

  // ── Shared suggestion pool ────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS suggestion_pool (
      cache_key  TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      hit_count  INTEGER NOT NULL DEFAULT 1,
      cached_at  INTEGER NOT NULL
    )
  `);

  // ── Per-user suggestion queue ─────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS suggestion_queue (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT    NOT NULL COLLATE NOCASE,
      activity_json TEXT    NOT NULL,
      position      INTEGER NOT NULL DEFAULT 0,
      generated_at  INTEGER NOT NULL,
      -- Rotation tracking
      shown_count   INTEGER NOT NULL DEFAULT 0,
      last_shown_at INTEGER,
      -- Expiry: NULL = evergreen (48h from generation), integer = unix ms
      expires_at    INTEGER,
      -- Legacy column kept for backwards compat but no longer used for filtering
      served        INTEGER NOT NULL DEFAULT 0,
      dismissed     INTEGER NOT NULL DEFAULT 0
    )
  `);
  try { await db.execute(`ALTER TABLE suggestion_queue ADD COLUMN shown_count   INTEGER NOT NULL DEFAULT 0`); } catch { /* already exists */ }
  try { await db.execute(`ALTER TABLE suggestion_queue ADD COLUMN last_shown_at INTEGER`); } catch { /* already exists */ }
  try { await db.execute(`ALTER TABLE suggestion_queue ADD COLUMN expires_at    INTEGER`); } catch { /* already exists */ }

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sq_email_expires
      ON suggestion_queue (email, expires_at, shown_count)
  `);

  // ── Shared places cache (no PII) ──────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS places_cache (
      cache_key TEXT PRIMARY KEY,
      data      TEXT    NOT NULL,   -- JSON Venue[]
      cached_at INTEGER NOT NULL
    )
  `);

  // ── Per-user blocked places ───────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS blocked_places (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      email      TEXT    NOT NULL COLLATE NOCASE,
      place_id   TEXT    NOT NULL,
      place_name TEXT    NOT NULL,
      address    TEXT    NOT NULL DEFAULT '',
      blocked_at INTEGER NOT NULL,
      UNIQUE(email, place_id)
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_bp_email
      ON blocked_places (email)
  `);

  // ── Recommendation history (rotation + dedup state) ───────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS recommendation_history (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      email        TEXT    NOT NULL COLLATE NOCASE,
      activity_ids TEXT    NOT NULL,   -- JSON array of IDs shown in this refresh
      shown_at     INTEGER NOT NULL
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_rh_email_time
      ON recommendation_history (email, shown_at DESC)
  `);
  // Prune history older than 7 days to keep the table small
  await db.execute(
    `DELETE FROM recommendation_history WHERE shown_at < ?`,
    [Date.now() - 7 * 24 * 60 * 60 * 1000]
  );

  // ── Seed users ────────────────────────────────────────────────────────────
  await db.execute({
    sql: 'INSERT OR IGNORE INTO users (email, invited_by, is_admin) VALUES (?, ?, 1)',
    args: [SEED_EMAIL, 'system'],
  });
  await db.execute({
    sql: 'UPDATE users SET is_admin = 1 WHERE email = ? COLLATE NOCASE',
    args: [SEED_EMAIL],
  });
  if (SEED_USER_2) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO users (email, invited_by, is_admin) VALUES (?, ?, 0)',
      args: [SEED_USER_2, 'system'],
    });
  }
}
