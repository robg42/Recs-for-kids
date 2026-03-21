'use client';

import type { WeatherData } from '@/types';

interface Props {
  weather: WeatherData;
}

export default function WeatherBadge({ weather }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-pill)',
        padding: '6px 12px',
        fontSize: '0.8rem',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        color: 'var(--color-text-muted)',
        flexShrink: 0,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://openweathermap.org/img/wn/${weather.icon}.png`}
        alt={weather.description}
        width={24}
        height={24}
        style={{ imageRendering: 'crisp-edges' }}
      />
      {weather.temperatureCelsius}°C
    </div>
  );
}
