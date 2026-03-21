import { getDb } from '@/lib/db';
import { createHash } from 'crypto';
import type { Activity, WeatherData, ActivityFilters } from '@/types';

const POOL_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours — suggestions stay relevant

interface PoolEntry {
  activities: Activity[];
  weather: WeatherData;
}

/** Round to a ~1km grid so nearby users share the same cache bucket */
function bucketCoord(n: number): number {
  return Math.round(n * 100) / 100;
}

function bucketTemp(t: number): number {
  return Math.floor(t / 5) * 5;
}

function budgetBracket(b: number): number {
  return Math.floor(b / 5) * 5;
}

export function buildPoolKey(
  coords: { lat: number; lon: number },
  filters: ActivityFilters,
  weather: WeatherData
): string {
  const obj = {
    lat: bucketCoord(coords.lat),
    lon: bucketCoord(coords.lon),
    time: filters.timeAvailable,
    io: filters.indoorOutdoor,
    energy: filters.energyLevel,
    budget: budgetBracket(filters.budgetPerChild),
    transport: filters.transport,
    rain: weather.isRaining,
    temp: bucketTemp(weather.temperatureCelsius),
  };
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
}

export async function getFromPool(key: string): Promise<PoolEntry | null> {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT data, cached_at FROM suggestion_pool WHERE cache_key = ? LIMIT 1',
      args: [key],
    });
    if (result.rows.length === 0) return null;

    const cachedAt = result.rows[0].cached_at as number;
    if (Date.now() - cachedAt > POOL_TTL_MS) return null;

    // Bump hit count
    await db.execute({
      sql: 'UPDATE suggestion_pool SET hit_count = hit_count + 1 WHERE cache_key = ?',
      args: [key],
    });

    return JSON.parse(result.rows[0].data as string) as PoolEntry;
  } catch {
    return null;
  }
}

export async function saveToPool(
  key: string,
  activities: Activity[],
  weather: WeatherData
): Promise<void> {
  try {
    const db = getDb();
    const payload: PoolEntry = { activities, weather };
    await db.execute({
      sql: 'INSERT OR REPLACE INTO suggestion_pool (cache_key, data, hit_count, cached_at) VALUES (?, ?, 1, ?)',
      args: [key, JSON.stringify(payload), Date.now()],
    });
  } catch (err) {
    console.error('[suggestion-pool] Save failed (non-fatal):', err);
  }
}
