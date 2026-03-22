import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { initSchema } from '@/lib/schema';
import { getRecommendations, SERVE_COUNT } from '@/lib/suggestion-queue';
import { loadServerCache } from '@/lib/activity-cache';

export const runtime = 'nodejs';

/**
 * GET /api/activities/queue
 *
 * Returns the next SERVE_COUNT activities for the authenticated user, selected
 * using the rotation algorithm (unseen first, never repeats last set, skips
 * blocked venues and expired items).
 *
 * Security: email comes exclusively from the server-side session.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { activities: [], eligibleRemaining: 0, error: 'Unauthorised' },
      { status: 401 }
    );
  }

  try {
    await initSchema();

    // Fire both in parallel — recommendations (multi-query) and weather cache read
    const [{ activities, eligibleRemaining, needsRefill, isStale }, serverCache] = await Promise.all([
      getRecommendations(session.email, SERVE_COUNT),
      loadServerCache(session.email).catch(() => null),
    ]);

    const weather = activities.length > 0 ? (serverCache?.weather ?? null) : null;

    return NextResponse.json({ activities, eligibleRemaining, needsRefill, isStale, weather });
  } catch (err) {
    console.error('[queue GET] Error:', err);
    return NextResponse.json({ activities: [], eligibleRemaining: 0, needsRefill: true }, { status: 500 });
  }
}
