import { getDb } from '@/lib/db';
import type { Activity, WeatherData, ActivityFilters } from '@/types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours server-side

interface CachePayload {
  activities: Activity[];
  weather: WeatherData;
  filters: ActivityFilters;
  cachedAt: number;
}

export async function saveServerCache(
  email: string,
  activities: Activity[],
  weather: WeatherData,
  filters: ActivityFilters
): Promise<void> {
  const db = getDb();
  const payload: CachePayload = { activities, weather, filters, cachedAt: Date.now() };
  await db.execute({
    sql: 'INSERT OR REPLACE INTO activity_cache (email, data, cached_at) VALUES (?, ?, ?)',
    args: [email.toLowerCase(), JSON.stringify(payload), Date.now()],
  });
}

export async function loadServerCache(email: string): Promise<CachePayload | null> {
  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT data, cached_at FROM activity_cache WHERE email = ? LIMIT 1',
    args: [email.toLowerCase()],
  });
  if (result.rows.length === 0) return null;

  const cachedAt = result.rows[0].cached_at as number;
  if (Date.now() - cachedAt > CACHE_TTL_MS) return null;

  try {
    return JSON.parse(result.rows[0].data as string) as CachePayload;
  } catch {
    return null;
  }
}
