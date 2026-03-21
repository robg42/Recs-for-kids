import type { Venue, IndoorOutdoor, EnergyLevel } from '@/types';

const PLACES_API_BASE = 'https://places.googleapis.com/v1/places:searchNearby';

// Radius in metres based on transport mode
export const TRANSPORT_RADIUS: Record<'car' | 'public', number> = {
  car: 15000,   // ~15km
  public: 3000, // ~3km
};

// Which Google Places types to query based on indoor/outdoor preference
const OUTDOOR_TYPES = ['park', 'playground', 'tourist_attraction', 'zoo', 'campground'];
const INDOOR_TYPES = [
  'museum',
  'art_gallery',
  'movie_theater',
  'amusement_center',
  'bowling_alley',
  'aquarium',
  'library',
];
const ALL_TYPES = [...OUTDOOR_TYPES, ...INDOOR_TYPES];

function getIncludedTypes(indoorOutdoor: IndoorOutdoor, energyLevel: EnergyLevel): string[] {
  let types: string[];
  if (indoorOutdoor === 'indoor') types = INDOOR_TYPES;
  else if (indoorOutdoor === 'outdoor') types = OUTDOOR_TYPES;
  else types = ALL_TYPES;

  // For low energy, deprioritise playgrounds, prioritise calmer venues
  if (energyLevel === 'low') {
    return types.filter((t) => !['playground', 'amusement_center', 'bowling_alley'].includes(t));
  }
  return types;
}

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

interface PlacesApiResponse {
  places?: PlacesApiPlace[];
}

export async function getNearbyVenues(
  lat: number,
  lon: number,
  radius: number,
  indoorOutdoor: IndoorOutdoor,
  energyLevel: EnergyLevel
): Promise<Venue[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error('[places] GOOGLE_PLACES_API_KEY is not set — cannot fetch venues');
    return [];
  }

  const includedTypes = getIncludedTypes(indoorOutdoor, energyLevel);
  console.log(`[places] Searching lat=${lat} lon=${lon} radius=${radius}m types=${includedTypes.join(',')}`);

  const body = {
    includedTypes,
    maxResultCount: 15,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lon },
        radius,
      },
    },
  };

  try {
    const res = await fetch(PLACES_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.primaryType,places.primaryTypeDisplayName,places.shortFormattedAddress,places.rating,places.currentOpeningHours,places.regularOpeningHours,places.photos,places.websiteUri,places.nationalPhoneNumber,places.priceLevel',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[places] API error ${res.status}: ${errBody}`);
      return [];
    }

    const data = (await res.json()) as PlacesApiResponse;
    const places = data.places ?? [];

    const venues = places
      .filter((p): p is PlacesApiPlace & { id: string; displayName: { text: string } } =>
        Boolean(p.id && p.displayName?.text)
      )
      .map((p) => ({
        placeId: p.id,
        name: p.displayName.text,
        address: p.shortFormattedAddress ?? '',
        rating: p.rating,
        openNow: p.currentOpeningHours?.openNow ?? true,
        type: p.primaryTypeDisplayName?.text ?? p.primaryType ?? 'venue',
        photoName: p.photos?.[0]?.name,
        website: p.websiteUri,
        phoneNumber: p.nationalPhoneNumber,
        openingHours: p.currentOpeningHours?.weekdayDescriptions ?? p.regularOpeningHours?.weekdayDescriptions,
        priceLevel: p.priceLevel,
      }));

    console.log(`[places] Found ${venues.length} venues (${venues.filter(v => v.photoName).length} with photos)`);
    return venues;
  } catch (err) {
    console.error('[places] Fetch error:', err);
    return [];
  }
}
