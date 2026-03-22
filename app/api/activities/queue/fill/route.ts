/**
 * POST /api/activities/queue/fill
 *
 * Generates two batches of 20 activities in parallel (total 40) and stores
 * them in the user's personal suggestion queue. Returns early if the queue
 * already has enough eligible items.
 *
 * Security: all DB operations use session.email, never client-supplied values.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWeather } from '@/lib/weather';
import { getNearbyVenues, TRANSPORT_RADIUS } from '@/lib/places';
import { generateActivities } from '@/lib/anthropic';
import { getSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/ip';
import { initSchema } from '@/lib/schema';
import { pushToQueue, getEligibleCount, isFillInProgress } from '@/lib/suggestion-queue';
import { buildPoolKey, getFromPool, saveToPool } from '@/lib/suggestion-pool';
import { saveServerCache } from '@/lib/activity-cache';
import { fetchLocalEvents } from '@/lib/events';
import type { GenerateActivitiesRequest } from '@/types';

export const runtime = 'nodejs';

const FILL_BATCH_SIZE = 20;          // activities per Claude call
const MIN_ELIGIBLE_BEFORE_FILL = 5; // skip fill if already enough items
const EVERGREEN_TTL_MS = 48 * 60 * 60 * 1000; // 48h

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  // Rate limits — generous since fills are background work
  const { allowed } = rateLimit(`queue-fill:${session.email}`, 10, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded', queued: 0 }, { status: 429 });
  }
  const ip = getClientIp(req);
  const { allowed: ipOk } = rateLimit(`queue-fill-ip:${ip}`, 25, 60 * 60 * 1000);
  if (!ipOk) {
    return NextResponse.json({ error: 'Rate limit exceeded', queued: 0 }, { status: 429 });
  }

  let body: GenerateActivitiesRequest;
  try {
    body = (await req.json()) as GenerateActivitiesRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { filters, children, coords, recentActivityIds, categoryWeights } = body;

  if (!coords?.lat || !coords?.lon || Math.abs(coords.lat) > 90 || Math.abs(coords.lon) > 180) {
    return NextResponse.json({ error: 'Invalid location' }, { status: 400 });
  }
  if (!Array.isArray(children) || children.length === 0 || children.length > 10) {
    return NextResponse.json({ error: 'Invalid children data' }, { status: 400 });
  }
  // Validate each child server-side — children come from the client payload so must be sanitised
  for (const c of children) {
    if (typeof c.age !== 'number' || c.age < 0 || c.age > 17) {
      return NextResponse.json({ error: 'Invalid child age' }, { status: 400 });
    }
    if (typeof c.name !== 'string' || c.name.length > 50) {
      return NextResponse.json({ error: 'Invalid child name' }, { status: 400 });
    }
  }

  try {
    await initSchema();

    // Guard: skip if queue already has enough items or a fill just ran
    const [eligible, filling] = await Promise.all([
      getEligibleCount(session.email),
      isFillInProgress(session.email),
    ]);
    if (eligible >= MIN_ELIGIBLE_BEFORE_FILL || filling) {
      return NextResponse.json({ queued: 0, skipped: true });
    }

    const radius = TRANSPORT_RADIUS[filters.transport] ?? TRANSPORT_RADIUS.car;

    // Fetch all data in parallel — one Places API call (cached 7 days), weather, events
    const [weather, venues, events] = await Promise.all([
      getWeather(coords.lat, coords.lon),
      getNearbyVenues(coords.lat, coords.lon, radius, filters.indoorOutdoor, filters.energyLevel),
      fetchLocalEvents(coords.lat, coords.lon).catch(() => []),
    ]);

    console.log(`[queue/fill] Generating 2×${FILL_BATCH_SIZE} for ${session.email}, ${venues.length} venues, ${events.length} events`);

    // Check shared pool — reuse if available (saves Anthropic credits)
    const poolKey = buildPoolKey(coords, filters, weather);
    const poolHit = await getFromPool(poolKey);

    let allActivities = poolHit?.activities ?? [];

    if (allActivities.length < FILL_BATCH_SIZE) {
      // Two parallel Claude calls with differentiated focus for variety:
      // Call A: venue-based, outdoor, active activities
      // Call B: creative, educational, event-based, home activities
      const [batchA, batchB] = await Promise.all([
        generateActivities(
          filters, children, venues, weather,
          recentActivityIds ?? [], categoryWeights,
          FILL_BATCH_SIZE, events,
          'Focus on physical, outdoor, and venue-based adventures. Vary the venues used.'
        ),
        generateActivities(
          filters, children, venues, weather,
          recentActivityIds ?? [], categoryWeights,
          FILL_BATCH_SIZE, events,
          'Focus on creative, educational, event-based, and home-based activities. Include at least 2 indoor options.'
        ),
      ]);

      // Deduplicate by venue placeId — same place shouldn't appear twice in the combined set
      const seenPlaceIds = new Set<string>();
      const deduped = [...batchA, ...batchB].filter((a) => {
        if (!a.venue?.placeId) return true; // home-based: always include
        if (seenPlaceIds.has(a.venue.placeId)) return false;
        seenPlaceIds.add(a.venue.placeId);
        return true;
      });

      allActivities = deduped;

      // Save first batch to shared pool for other users with same conditions
      await saveToPool(poolKey, batchA, weather).catch((err) =>
        console.error('[queue/fill] Pool save failed (non-fatal):', err)
      );
    }

    // ── Image enrichment ─────────────────────────────────────────────────────
    // Match each activity against local events by title.  When a match is found,
    // copy the event's imageUrl (Eventbrite logo or Serper thumbnail) onto the
    // activity so it's baked in at storage time — no re-fetch needed at serve time.
    //
    // This runs before expiry calculation so we can share the eventsMap.
    const eventsMap = new Map(events.map((e) => [e.title.toLowerCase().trim(), e]));

    for (const activity of allActivities) {
      if (activity.imageUrl) continue; // already has an image (e.g. from pool)
      const matchedEvent = eventsMap.get(activity.title.toLowerCase().trim());
      if (matchedEvent?.imageUrl) {
        activity.imageUrl = matchedEvent.imageUrl;
      }
    }

    // Compute expiry per activity:
    //   Event with endsAt   → endsAt + 2h grace (tightest, most accurate)
    //   Event with startsAt → startsAt + 26h (start + ~1 day; event probably ends same day)
    //   Activity with sourceUrl but no dates → end-of-today + 24h (safe fallback)
    //   Evergreen           → generated_at + 48h (handled via EVERGREEN_TTL_MS)
    const now = Date.now();
    const evergreenExpiry = now + EVERGREEN_TTL_MS;

    const withExpiry = allActivities.map((activity) => {
      const matchedEvent = eventsMap.get(activity.title.toLowerCase().trim());
      let expiresAt: number | undefined;

      if (matchedEvent?.endsAt) {
        const end = new Date(matchedEvent.endsAt).getTime();
        if (!isNaN(end) && end > now) expiresAt = end + 2 * 60 * 60 * 1000; // +2h grace
      }

      if (!expiresAt && matchedEvent?.startsAt) {
        const start = new Date(matchedEvent.startsAt).getTime();
        if (!isNaN(start)) expiresAt = start + 26 * 60 * 60 * 1000; // start + 26h
      }

      if (!expiresAt && activity.sourceUrl) {
        // sourceUrl present but no structured date — expire end-of-today + 24h
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        expiresAt = endOfToday.getTime() + 24 * 60 * 60 * 1000;
      }

      return { activity, expiresAt: expiresAt ?? evergreenExpiry };
    });

    // Push to queue in two groups to preserve expiry per activity
    // (pushToQueue accepts a single expiresAt for the whole batch, so we batch by expiry)
    for (const { activity, expiresAt } of withExpiry) {
      await pushToQueue(session.email, [activity], expiresAt);
    }

    // Update activity cache so cached endpoint stays fresh
    await saveServerCache(session.email, allActivities.slice(0, 15), weather, filters).catch(() => {});

    console.log(`[queue/fill] Queued ${withExpiry.length} activities for ${session.email}`);
    return NextResponse.json({ queued: withExpiry.length });
  } catch (err) {
    console.error('[queue/fill] Error:', err);
    return NextResponse.json({ error: 'Failed to generate activities', queued: 0 }, { status: 500 });
  }
}
