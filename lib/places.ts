import { createHash } from 'crypto';
import { getDb } from '@/lib/db';
import type { Venue, IndoorOutdoor, EnergyLevel } from '@/types';

const PLACES_API_BASE = 'https://places.googleapis.com/v1/places:searchNearby';
const PLACES_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Radius in metres based on transport mode
export const TRANSPORT_RADIUS: Record<'car' | 'public' | 'walking', number> = {
  car: 15000,    // ~15km
  public: 3000,  // ~3km
  walking: 1500, // ~1.5km
};

// ── Venue type lists ──────────────────────────────────────────────────────────
// We always fetch ALL types in one broad call (maxResultCount: 20) and filter
// in memory. This means one Places API credit covers every preference combo,
// and the cache serves all future requests until it expires (7 days).
const ALL_VENUE_TYPES = [
  // Outdoor
  'park', 'playground', 'tourist_attraction', 'zoo', 'campground',
  'botanical_garden', 'national_park', 'hiking_area',
  // Indoor
  'museum', 'art_gallery', 'movie_theater', 'amusement_center',
  'bowling_alley', 'aquarium', 'library', 'performing_arts_theater',
  'trampoline_park',
];

const OUTDOOR_TYPES = new Set([
  'park', 'playground', 'tourist_attraction', 'zoo', 'campground',
  'botanical_garden', 'national_park', 'hiking_area',
]);

const LOW_ENERGY_EXCLUDE = new Set([
  'playground', 'amusement_center', 'bowling_alley', 'trampoline_park',
]);

function filterVenues(
  venues: Venue[],
  indoorOutdoor: IndoorOutdoor,
  energyLevel: EnergyLevel
): Venue[] {
  return venues.filter((v) => {
    const typeKey = (v.type ?? '').toLowerCase().replace(/\s+/g, '_');
    if (indoorOutdoor === 'indoor' && OUTDOOR_TYPES.has(typeKey)) return false;
    if (indoorOutdoor === 'outdoor' && !OUTDOOR_TYPES.has(typeKey)) return false;
    if (energyLevel === 'low' && LOW_ENERGY_EXCLUDE.has(typeKey)) return false;
    return true;
  });
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

function buildCacheKey(lat: number, lon: number, radius: number): string {
  const obj = {
    lat: Math.round(lat * 100) / 100, // 2dp ≈ 1km grid
    lon: Math.round(lon * 100) / 100,
    r: radius,
  };
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
}

async function getCachedVenues(cacheKey: string): Promise<Venue[] | null> {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT data, cached_at FROM places_cache WHERE cache_key = ? LIMIT 1',
      args: [cacheKey],
    });
    if (result.rows.length === 0) return null;
    if (Date.now() - (result.rows[0].cached_at as number) > PLACES_CACHE_TTL_MS) return null;
    return JSON.parse(result.rows[0].data as string) as Venue[];
  } catch {
    return null;
  }
}

async function setCachedVenues(cacheKey: string, venues: Venue[]): Promise<void> {
  try {
    const db = getDb();
    await db.execute({
      sql: 'INSERT OR REPLACE INTO places_cache (cache_key, data, cached_at) VALUES (?, ?, ?)',
      args: [cacheKey, JSON.stringify(venues), Date.now()],
    });
  } catch (err) {
    console.warn('[places] Cache write failed (non-fatal):', err);
  }
}

// ── Places API ────────────────────────────────────────────────────────────────

interface PlacesApiPlace {
  id?: string;
  displayName?: { text: string };
  primaryTypeDisplayName?: { text: string };
  shortFormattedAddress?: string;
  rating?: number;
  currentOpeningHours?: { openNow: boolean; weekdayDescriptions?: string[] };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  primaryType?: string;
  photos?: Array<{ name: string }>;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  priceLevel?: string;
}

async function fetchFromApi(lat: number, lon: number, radius: number): Promise<Venue[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error('[places] GOOGLE_PLACES_API_KEY not set');
    return [];
  }

  const body = {
    includedTypes: ALL_VENUE_TYPES,
    maxResultCount: 20,
    locationRestriction: {
      circle: { center: { latitude: lat, longitude: lon }, radius },
    },
  };

  const res = await fetch(PLACES_API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.primaryType,places.primaryTypeDisplayName,' +
        'places.shortFormattedAddress,places.rating,places.currentOpeningHours,' +
        'places.regularOpeningHours,places.photos,places.websiteUri,' +
        'places.nationalPhoneNumber,places.priceLevel',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    console.error(`[places] API ${res.status}: ${await res.text()}`);
    return [];
  }

  const data = (await res.json()) as { places?: PlacesApiPlace[] };
  const venues = (data.places ?? [])
    .filter(
      (p): p is PlacesApiPlace & { id: string; displayName: { text: string } } =>
        Boolean(p.id && p.displayName?.text)
    )
    .map((p): Venue => ({
      placeId: p.id,
      name: p.displayName.text,
      address: p.shortFormattedAddress ?? '',
      rating: p.rating,
      openNow: p.currentOpeningHours?.openNow ?? true,
      type: p.primaryTypeDisplayName?.text ?? p.primaryType ?? 'venue',
      photoName: p.photos?.[0]?.name,
      website: p.websiteUri,
      phoneNumber: p.nationalPhoneNumber,
      openingHours:
        p.currentOpeningHours?.weekdayDescriptions ??
        p.regularOpeningHours?.weekdayDescriptions,
      priceLevel: p.priceLevel,
    }));

  console.log(`[places] API returned ${venues.length} venues`);
  return venues;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns nearby venues, using a 7-day shared cache keyed on 1km location
 * bucket + radius. ALL venue types are fetched in a single API call and
 * filtered in memory, so the cache serves every preference combination.
 * On API failure, serves stale cache as a graceful fallback.
 */
export async function getNearbyVenues(
  lat: number,
  lon: number,
  radius: number,
  indoorOutdoor: IndoorOutdoor,
  energyLevel: EnergyLevel
): Promise<Venue[]> {
  const cacheKey = buildCacheKey(lat, lon, radius);

  const cached = await getCachedVenues(cacheKey);
  if (cached) {
    console.log(`[places] Cache hit key=${cacheKey} (${cached.length} venues)`);
    return filterVenues(cached, indoorOutdoor, energyLevel);
  }

  console.log(`[places] Cache miss — fetching from API lat=${lat} lon=${lon} r=${radius}m`);
  let venues: Venue[] = [];
  try {
    venues = await fetchFromApi(lat, lon, radius);
  } catch (err) {
    console.error('[places] Fetch error:', err);
  }

  if (venues.length > 0) {
    await setCachedVenues(cacheKey, venues);
  } else {
    // Graceful fallback: serve stale cache rather than zero venues
    try {
      const db = getDb();
      const stale = await db.execute({
        sql: 'SELECT data FROM places_cache WHERE cache_key = ? LIMIT 1',
        args: [cacheKey],
      });
      if (stale.rows.length > 0) {
        console.warn('[places] Serving stale cache as fallback');
        venues = JSON.parse(stale.rows[0].data as string) as Venue[];
      }
    } catch { /* ignore */ }
  }

  return filterVenues(venues, indoorOutdoor, energyLevel);
}
