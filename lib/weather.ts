import type { WeatherData } from '@/types';

interface OWMResponse {
  weather: Array<{ main: string; description: string; icon: string }>;
  main: { temp: number };
  cod: number;
}

export async function getWeather(lat: number, lon: number): Promise<WeatherData> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return fallbackWeather();
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } }); // cache 30 min
    if (!res.ok) return fallbackWeather();

    const data = (await res.json()) as OWMResponse;
    const condition = data.weather[0]?.main ?? 'Clear';
    const description = data.weather[0]?.description ?? 'clear sky';
    const icon = data.weather[0]?.icon ?? '01d';
    const temperatureCelsius = Math.round(data.main.temp);
    const isRaining = ['Rain', 'Drizzle', 'Thunderstorm', 'Snow'].includes(condition);

    return { condition, description, temperatureCelsius, isRaining, icon };
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
