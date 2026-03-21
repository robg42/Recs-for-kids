import { NextRequest, NextResponse } from 'next/server';
import { getWeather } from '@/lib/weather';
import { getNearbyVenues, TRANSPORT_RADIUS } from '@/lib/places';
import { generateActivities } from '@/lib/anthropic';
import type { GenerateActivitiesRequest, GenerateActivitiesResponse } from '@/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GenerateActivitiesRequest;
    const { filters, children, coords, recentActivityIds, categoryWeights } = body;

    if (!coords?.lat || !coords?.lon) {
      return NextResponse.json<GenerateActivitiesResponse>(
        { activities: [], weather: fallbackWeather(), error: 'Location required' },
        { status: 400 }
      );
    }

    if (!children || children.length === 0) {
      return NextResponse.json<GenerateActivitiesResponse>(
        { activities: [], weather: fallbackWeather(), error: 'No children profiles set' },
        { status: 400 }
      );
    }

    const radius = TRANSPORT_RADIUS[filters.transport];

    // Fetch weather and venues in parallel
    const [weather, venues] = await Promise.all([
      getWeather(coords.lat, coords.lon),
      getNearbyVenues(coords.lat, coords.lon, radius, filters.indoorOutdoor, filters.energyLevel),
    ]);

    const activities = await generateActivities(
      filters,
      children,
      venues,
      weather,
      recentActivityIds ?? [],
      categoryWeights
    );

    return NextResponse.json<GenerateActivitiesResponse>({ activities, weather });
  } catch (err) {
    console.error('[api/activities] Error:', err);
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
