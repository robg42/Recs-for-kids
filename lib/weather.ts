import type { WeatherData } from '@/types';

interface OWMResponse {
  weather: Array<{ main: string; description: string; icon: string }>;
  main: { temp: number };
  cod: number;
}

// In-process cache keyed by rounded coords (0.1° ≈ 11 km) — avoids duplicate
// API calls within the same server process during the 30-minute revalidate window.
const _cache = new Map<string, { data: WeatherData; fetchedAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — matches next.revalidate

export async function getWeather(lat: number, lon: number): Promise<WeatherData> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return fallbackWeather();
  }

  // Round to 1 decimal place so nearby locations share cache entries
  const cacheKey = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } }); // Next.js data cache 30 min
    if (!res.ok) return fallbackWeather();

    const data = (await res.json()) as OWMResponse;
    const condition = data.weather[0]?.main ?? 'Clear';
    const description = data.weather[0]?.description ?? 'clear sky';
    const icon = data.weather[0]?.icon ?? '01d';
    const temperatureCelsius = Math.round(data.main.temp);
    const isRaining = ['Rain', 'Drizzle', 'Thunderstorm', 'Snow'].includes(condition);

    const result: WeatherData = { condition, description, temperatureCelsius, isRaining, icon };
    _cache.set(cacheKey, { data: result, fetchedAt: Date.now() });
    return result;
  } catch {
    return fallbackWeather();
  }
}

function fallbackWeather(): WeatherData {
  return {
    condition: 'Clear',
    description: 'clear sky',
    temperatureCelsius: 15,
    isRaining: false,
    icon: '01d',
  };
}
