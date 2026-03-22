/**
 * Per-user blocked places.
 * All functions are strictly scoped to the authenticated user's email —
 * no function accepts email from client input; callers must supply session.email.
 */
import { getDb } from '@/lib/db';
import type { BlockedPlace } from '@/types';

/** Block a venue for a user. Idempotent — safe to call if already blocked. */
export async function blockPlace(
  email: string,
  placeId: string,
  placeName: string,
  address: string
): Promise<void> {
  // Validate inputs — placeId comes from a trusted Claude/Places response but
  // we sanitise defensively since it flows back to the client.
  if (!placeId || placeId.length > 500) throw new Error('Invalid placeId');
  if (!placeName || placeName.length > 200) throw new Error('Invalid placeName');

  const db = getDb();
  await db.execute({
    sql: `INSERT OR IGNORE INTO blocked_places
            (email, place_id, place_name, address, blocked_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [
      email.toLowerCase(),
      placeId.slice(0, 500),
      placeName.slice(0, 200),
      (address ?? '').slice(0, 300),
      Date.now(),
    ],
  });
}

/** Unblock a venue. No-op if it wasn't blocked. */
export async function unblockPlace(email: string, placeId: string): Promise<void> {
  if (!placeId || placeId.length > 500) throw new Error('Invalid placeId');
  const db = getDb();
  await db.execute({
    sql: 'DELETE FROM blocked_places WHERE email = ? AND place_id = ?',
    args: [email.toLowerCase(), placeId],
  });
}

/** Returns all blocked places for the user, newest first. */
export async function getBlockedPlaces(email: string): Promise<BlockedPlace[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT place_id, place_name, address, blocked_at
          FROM blocked_places
          WHERE email = ?
          ORDER BY blocked_at DESC`,
    args: [email.toLowerCase()],
  });
  return result.rows.map((r) => ({
    placeId: r.place_id as string,
    placeName: r.place_name as string,
    address: r.address as string,
    blockedAt: r.blocked_at as number,
  }));
}

/** Returns a Set of blocked place_ids for fast lookup during recommendation serving. */
export async function getBlockedPlaceIds(email: string): Promise<Set<string>> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT place_id FROM blocked_places WHERE email = ?',
    args: [email.toLowerCase()],
  });
  return new Set(result.rows.map((r) => r.place_id as string));
}
