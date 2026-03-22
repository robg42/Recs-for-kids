/**
 * Geocoding utilities — postcode lookup via the free postcodes.io API
 * No API key required; covers England, Scotland, Wales and Northern Ireland.
 */

interface PostcodesIoResult {
  status: number;
  result?: {
    latitude: number;
    longitude: number;
    admin_district?: string;
    admin_ward?: string;
  };
}

/**
 * Convert a UK postcode to lat/lon coordinates.
 * Throws with a human-readable message on failure.
 */
export async function postcodeToCoords(
  postcode: string
): Promise<{ lat: number; lon: number; label: string }> {
  const clean = postcode.replace(/\s+/g, '').toUpperCase();

  if (!/^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/.test(clean)) {
    throw new Error('Please enter a valid UK postcode (e.g. SE1 3PQ)');
  }

  const res = await fetch(
    `https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`,
    { signal: AbortSignal.timeout(8000) }
  );

  if (res.status === 404) throw new Error('Postcode not found — please check and try again');
  if (!res.ok) throw new Error('Could not look up postcode — please try again');

  const data: PostcodesIoResult = await res.json();

  if (!data.result) throw new Error('Postcode not found');

  // Friendly display label: formatted postcode
  const label = `${clean.slice(0, -3)} ${clean.slice(-3)}`;

  return { lat: data.result.latitude, lon: data.result.longitude, label };
}
