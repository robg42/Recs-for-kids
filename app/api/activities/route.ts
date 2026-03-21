import { NextRequest, NextResponse } from 'next/server';
import { getWeather } from '@/lib/weather';
import { getNearbyVenues, TRANSPORT_RADIUS } from '@/lib/places';
import { generateActivities } from '@/lib/anthropic';
import { getSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/ip';
import { saveServerCache } from '@/lib/activity-cache';
import { initSchema } from '@/lib/schema';
import type { GenerateActivitiesRequest, GenerateActivitiesResponse } from '@/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // Defence-in-depth auth check independent of middleware
  const session = await getSession();
  if (!session) {
    return NextResponse.json<GenerateActivitiesResponse>(
      { activities: [], weather: fallbackWeather(), error: 'Unauthorised' },
      { status: 401 }
    );
  }

  // Per-user rate limit: 20 per minute (generous for filter exploration)
  const { allowed } = rateLimit(`activities:${session.email}`, 20, 60 * 1000);
  if (!allowed) {
    return NextResponse.json<GenerateActivitiesResponse>(
      { activities: [], weather: fallbackWeather(), error: 'Too many requests. Please slow down.' },
      { status: 429 }
    );
  }

  // Secondary IP guard
  const ip = getClientIp(req);
  const { allowed: ipAllowed } = rateLimit(`activities-ip:${ip}`, 40, 60 * 1000);
  if (!ipAllowed) {
    return NextResponse.json<GenerateActivitiesResponse>(
      { activities: [], weather: fallbackWeather(), error: 'Too many requests.' },
      { status: 429 }
    );
  }

  let body: GenerateActivitiesRequest;
  try {
    body = (await req.json()) as GenerateActivitiesRequest;
  } catch {
    return NextResponse.json<GenerateActivitiesResponse>(
      { activities: [], weather: fallbackWeather(), error: 'Invalid request body' },
      { status: 400 }
    );
  }

  const { filters, children, coords, recentActivityIds, categoryWeights } = body;

  // Validate coordinates are within valid geographic bounds
  if (
    !coords?.lat ||
    !coords?.lon ||
    Math.abs(coords.lat) > 90 ||
    Math.abs(coords.lon) > 180
  ) {
    return NextResponse.json<GenerateActivitiesResponse>(
      { activities: [], weather: fallbackWeather(), error: 'Invalid or missing location' },
      { status: 400 }
    );
  }

  // Validate children array — must exist, be non-empty, and be reasonably sized
  if (!Array.isArray(children) || children.length === 0 || children.length > 10) {
    return NextResponse.json<GenerateActivitiesResponse>(
      { activities: [], weather: fallbackWeather(), error: 'Invalid children data' },
      { status: 400 }
    );
  }

  // Validate each child has a sane age
  for (const child of children) {
    if (typeof child.age !== 'number' || child.age < 0 || child.age > 17) {
      return NextResponse.json<GenerateActivitiesResponse>(
        { activities: [], weather: fallbackWeather(), error: 'Invalid child age' },
        { status: 400 }
      );
    }
    if (typeof child.name !== 'string' || child.name.length > 50) {
      return NextResponse.json<GenerateActivitiesResponse>(
        { activities: [], weather: fallbackWeather(), error: 'Invalid child name' },
        { status: 400 }
      );
    }
  }

  // Validate budget is within sensible bounds
  if (
    filters?.budgetPerChild !== undefined &&
    (filters.budgetPerChild < 0 || filters.budgetPerChild > 500)
  ) {
    return NextResponse.json<GenerateActivitiesResponse>(
      { activities: [], weather: fallbackWeather(), error: 'Invalid budget' },
      { status: 400 }
    );
  }

  try {
    const radius = TRANSPORT_RADIUS[filters.transport] ?? TRANSPORT_RADIUS.car;

    console.log(`[api/activities] user=${session.email} coords=${coords.lat},${coords.lon} transport=${filters.transport} indoor=${filters.indoorOutdoor} energy=${filters.energyLevel}`);

    const [weather, venues] = await Promise.all([
      getWeather(coords.lat, coords.lon),
      getNearbyVenues(coords.lat, coords.lon, radius, filters.indoorOutdoor, filters.energyLevel),
    ]);

    if (venues.length === 0) {
      console.warn('[api/activities] No venues returned — activities will be generated without real locations');
    }

    const activities = await generateActivities(
      filters,
      children,
      venues,
      weather,
      recentActivityIds ?? [],
      categoryWeights
    );

    console.log(`[api/activities] Generated ${activities.length} activities for ${session.email}`);

    // Persist to server-side cache so returning users get instant results
    try {
      await initSchema();
      await saveServerCache(session.email, activities, weather, filters);
    } catch (cacheErr) {
      console.error('[api/activities] Cache save failed (non-fatal):', cacheErr);
    }

    return NextResponse.json<GenerateActivitiesResponse>({ activities, weather });
  } catch (err) {
    console.error('[api/activities] Unhandled error:', err);
    return NextResponse.json<GenerateActivitiesResponse>(
      { activities: [], weather: fallbackWeather(), error: 'Something went wrong' },
      { status: 500 }
    );
  }
}

function fallbackWeather() {
  return {
    condition: 'Clear',
    description: 'clear sky',
    temperatureCelsius: 15,
    isRaining: false,
    icon: '01d',
  };
}
