/**
 * Per-user suggestion queue with rotation logic.
 *
 * Key behaviours:
 *  - Items are served 3 at a time (SERVE_COUNT)
 *  - Never repeat the immediately previous set unless nothing else is eligible
 *  - Prefer unseen items → items not shown in last 2h → least-recently-shown
 *  - Expired items (time-based events) are silently skipped
 *  - Blocked venue items are silently skipped
 *  - Background refill triggered when eligible count < REFILL_THRESHOLD
 *
 * Security: all queries are strictly scoped to the caller-supplied email,
 * which must come from the server-side session — never from client input.
 */

import { getDb } from '@/lib/db';
import { getBlockedPlaceIds } from '@/lib/blocked-places';
import type { Activity } from '@/types';

export const SERVE_COUNT = 3;
const REFILL_THRESHOLD = 12;
const RECENT_WINDOW_MS = 2 * 60 * 60 * 1000;       // 2 hours
const EVERGREEN_TTL_MS = 5 * 24 * 60 * 60 * 1000;  // 5 days (was 48 h — longer TTL means
                                                     // returning users never see an empty queue)

// ── Eligibility count ────────────────────────────────────────────────────────

export async function getEligibleCount(email: string): Promise<number> {
  try {
    const db = getDb();
    const now = Date.now();
    const evergreenCutoff = now - EVERGREEN_TTL_MS;
    const result = await db.execute({
      sql: `SELECT COUNT(*) as cnt
            FROM suggestion_queue
            WHERE email = ?
              AND (expires_at IS NOT NULL AND expires_at > ? OR expires_at IS NULL AND generated_at > ?)`,
      args: [email.toLowerCase(), now, evergreenCutoff],
    });
    return Number(result.rows[0].cnt ?? 0);
  } catch {
    return 0;
  }
}

// ── Rotation: get next recommendations ───────────────────────────────────────

interface QueueRow {
  id: number;
  activity: Activity;
  shownCount: number;
  lastShownAt: number | null;
  expiresAt: number | null;
}

export async function getRecommendations(
  email: string,
  count: number = SERVE_COUNT
): Promise<{ activities: Activity[]; eligibleRemaining: number; needsRefill: boolean; isStale: boolean }> {
  const normEmail = email.toLowerCase();
  const now = Date.now();
  const evergreenCutoff = now - EVERGREEN_TTL_MS;

  try {
    const db = getDb();

    // Fire all 4 independent read queries in parallel — saves ~3 Turso round-trips
    const [blockedIds, lastSetRow, recentRows, queueRows] = await Promise.all([
      // 1. Blocked place IDs for this user
      getBlockedPlaceIds(normEmail),

      // 2. IDs from the immediately previous served set (for dedup)
      db.execute({
        sql: `SELECT activity_ids FROM recommendation_history
              WHERE email = ? ORDER BY shown_at DESC LIMIT 1`,
        args: [normEmail],
      }),

      // 3. All recently shown IDs (last 2 hours)
      db.execute({
        sql: `SELECT activity_ids FROM recommendation_history
              WHERE email = ? AND shown_at > ?`,
        args: [normEmail, now - RECENT_WINDOW_MS],
      }),

      // 4. All non-expired queue items
      db.execute({
        sql: `SELECT id, activity_json, shown_count, last_shown_at, expires_at, generated_at
              FROM suggestion_queue
              WHERE email = ?
                AND (
                  expires_at IS NOT NULL AND expires_at > ?
                  OR expires_at IS NULL AND generated_at > ?
                )
              ORDER BY shown_count ASC, generated_at ASC`,
        args: [normEmail, now, evergreenCutoff],
      }),
    ]);

    const lastSetIds = new Set<string>(
      lastSetRow.rows.length > 0
        ? (JSON.parse(lastSetRow.rows[0].activity_ids as string) as string[])
        : []
    );

    const recentIds = new Set<string>();
    for (const row of recentRows.rows) {
      const ids = JSON.parse(row.activity_ids as string) as string[];
      ids.forEach((id) => recentIds.add(id));
    }

    // 5. Build candidate list, excluding blocked venues
    const candidates: QueueRow[] = [];
    for (const row of queueRows.rows) {
      let activity: Activity;
      try {
        activity = JSON.parse(row.activity_json as string) as Activity;
      } catch {
        continue;
      }
      // Skip if venue is blocked
      if (activity.venue?.placeId && blockedIds.has(activity.venue.placeId)) continue;
      candidates.push({
        id: row.id as number,
        activity,
        shownCount: row.shown_count as number,
        lastShownAt: row.last_shown_at as number | null,
        expiresAt: row.expires_at as number | null,
      });
    }

    if (candidates.length === 0) {
      // Stale-while-revalidate: serve the most recently generated evergreen items
      // (ignoring expiry) so the user sees SOMETHING immediately while a fill runs.
      // Event-based items (expires_at IS NOT NULL) are excluded even from stale serving
      // because they may refer to things that have already happened.
      const staleRows = await db.execute({
        sql: `SELECT id, activity_json, shown_count, last_shown_at, expires_at, generated_at
              FROM suggestion_queue
              WHERE email = ?
                AND expires_at IS NULL
              ORDER BY generated_at DESC
              LIMIT ?`,
        args: [normEmail, count * 3],
      });

      if (staleRows.rows.length === 0) {
        return { activities: [], eligibleRemaining: 0, needsRefill: true, isStale: false };
      }

      // Pick `count` stale items, skipping blocked venues
      const staleActivities: Activity[] = [];
      for (const row of staleRows.rows) {
        if (staleActivities.length >= count) break;
        let activity: Activity;
        try { activity = JSON.parse(row.activity_json as string) as Activity; } catch { continue; }
        if (activity.venue?.placeId && blockedIds.has(activity.venue.placeId)) continue;
        staleActivities.push(activity);
      }

      return { activities: staleActivities, eligibleRemaining: 0, needsRefill: true, isStale: true };
    }

    // 6. Select `count` items using priority tiers.
    //
    //    Time-sensitive items (those with a sourceUrl, i.e. Eventbrite / web-search
    //    events) are sorted to the front within each tier so they are served first
    //    when available. This preserves the freshness hierarchy — a stale event
    //    (in the last set) is still below fresh evergreen — while ensuring that
    //    live events beat evergreen items of the same freshness class.
    //
    //    Tier 1: not in lastSet AND not in recent  (truly fresh)
    //    Tier 2: not in lastSet (was shown before but not in the last set or 2h)
    //    Tier 3: anything eligible (fallback — forces different from last set where possible)
    const isTimeSensitive = (c: QueueRow) => Boolean(c.activity.sourceUrl);

    // Within a tier: time-sensitive first, then by soonest expires_at (most urgent first)
    const byUrgency = (a: QueueRow, b: QueueRow) => {
      const aTs = isTimeSensitive(a) ? 0 : 1;
      const bTs = isTimeSensitive(b) ? 0 : 1;
      if (aTs !== bTs) return aTs - bTs;
      // Both same type — prefer soonest expiry so events aren't missed
      const aExp = a.expiresAt ?? Infinity;
      const bExp = b.expiresAt ?? Infinity;
      return aExp - bExp;
    };

    const tier1 = candidates
      .filter((c) => !lastSetIds.has(c.activity.id) && !recentIds.has(c.activity.id))
      .sort(byUrgency);
    const tier2 = candidates
      .filter((c) => !lastSetIds.has(c.activity.id) && recentIds.has(c.activity.id))
      .sort(byUrgency);
    const tier3 = candidates
      .filter((c) => lastSetIds.has(c.activity.id))
      .sort(byUrgency);

    const selected: QueueRow[] = [];
    const pick = (pool: QueueRow[]) => {
      for (const item of pool) {
        if (selected.length >= count) break;
        if (!selected.find((s) => s.id === item.id)) selected.push(item);
      }
    };
    pick(tier1);
    pick(tier2);
    pick(tier3);

    // 7. Batch-update shown_count + last_shown_at in a single query + insert history
    const selectedIds = selected.map((c) => c.activity.id);
    if (selected.length > 0) {
      const placeholders = selected.map(() => '?').join(', ');
      await Promise.all([
        db.execute({
          sql: `UPDATE suggestion_queue
                SET shown_count = shown_count + 1, last_shown_at = ?
                WHERE id IN (${placeholders})`,
          args: [now, ...selected.map((s) => s.id)],
        }),
        db.execute({
          sql: `INSERT INTO recommendation_history (email, activity_ids, shown_at)
                VALUES (?, ?, ?)`,
          args: [normEmail, JSON.stringify(selectedIds), now],
        }),
      ]);
    }

    // 9. Count eligible remaining (excluding just-selected)
    const selectedDbIds = new Set(selected.map((c) => c.id));
    const eligibleRemaining = candidates.filter((c) => !selectedDbIds.has(c.id)).length;

    return {
      activities: selected.map((c) => c.activity),
      eligibleRemaining,
      needsRefill: eligibleRemaining < REFILL_THRESHOLD,
      isStale: false,
    };
  } catch (err) {
    console.error('[suggestion-queue] getRecommendations failed:', err);
    return { activities: [], eligibleRemaining: 0, needsRefill: true, isStale: false };
  }
}

// ── Push new activities to the queue ─────────────────────────────────────────

/**
 * Add activities to the user's queue.
 * @param expiresAtMs  Optional explicit expiry (unix ms) — use for timed events.
 *                     Omit for evergreen activities (they expire via generated_at TTL).
 */
export async function pushToQueue(
  email: string,
  activities: Activity[],
  expiresAtMs?: number
): Promise<void> {
  if (activities.length === 0) return;
  const normEmail = email.toLowerCase();
  try {
    const db = getDb();
    const now = Date.now();

    const maxResult = await db.execute({
      sql: 'SELECT COALESCE(MAX(position), -1) as maxpos FROM suggestion_queue WHERE email = ?',
      args: [normEmail],
    });
    let position = Number(maxResult.rows[0].maxpos ?? -1) + 1;

    for (const activity of activities) {
      await db.execute({
        sql: `INSERT INTO suggestion_queue
                (email, activity_json, position, generated_at, expires_at,
                 shown_count, served, dismissed)
              VALUES (?, ?, ?, ?, ?, 0, 0, 0)`,
        args: [normEmail, JSON.stringify(activity), position++, now, expiresAtMs ?? null],
      });
    }

    // Prune rows beyond 300 per user to keep the table bounded
    await db.execute({
      sql: `DELETE FROM suggestion_queue
            WHERE email = ? AND id NOT IN (
              SELECT id FROM suggestion_queue WHERE email = ?
              ORDER BY position DESC LIMIT 300
            )`,
      args: [normEmail, normEmail],
    });
  } catch (err) {
    console.error('[suggestion-queue] pushToQueue failed:', err);
  }
}

// ── Read-only preview: all queued items (no shown_count update) ───────────────

/**
 * Returns all eligible queue items for the user, excluding a set of IDs
 * already on screen.  Does NOT mark items as shown — purely for browsing.
 */
export async function getQueuePreview(
  email: string,
  excludeIds: string[] = [],
  maxCount = 50
): Promise<Activity[]> {
  const normEmail = email.toLowerCase();
  const now = Date.now();
  const evergreenCutoff = now - EVERGREEN_TTL_MS;

  try {
    const db = getDb();
    const [blockedIds, queueRows] = await Promise.all([
      getBlockedPlaceIds(normEmail),
      db.execute({
        sql: `SELECT activity_json FROM suggestion_queue
              WHERE email = ?
                AND (
                  expires_at IS NOT NULL AND expires_at > ?
                  OR expires_at IS NULL AND generated_at > ?
                )
              ORDER BY shown_count ASC, generated_at ASC
              LIMIT ?`,
        args: [normEmail, now, evergreenCutoff, maxCount + excludeIds.length + 20],
      }),
    ]);

    const excludeSet = new Set(excludeIds);
    const activities: Activity[] = [];
    for (const row of queueRows.rows) {
      if (activities.length >= maxCount) break;
      let activity: Activity;
      try { activity = JSON.parse(row.activity_json as string) as Activity; } catch { continue; }
      if (excludeSet.has(activity.id)) continue;
      if (activity.venue?.placeId && blockedIds.has(activity.venue.placeId)) continue;
      activities.push(activity);
    }
    return activities;
  } catch (err) {
    console.error('[suggestion-queue] getQueuePreview failed:', err);
    return [];
  }
}

// ── Fill-guard: prevent concurrent duplicate fills ───────────────────────────

/** Returns true if a fill was inserted in the last 45 seconds (prevents double-billing). */
export async function isFillInProgress(email: string): Promise<boolean> {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT COUNT(*) as cnt FROM suggestion_queue WHERE email = ? AND generated_at > ?',
      args: [email.toLowerCase(), Date.now() - 45_000],
    });
    return Number(result.rows[0].cnt ?? 0) > 0;
  } catch {
    return false;
  }
}
