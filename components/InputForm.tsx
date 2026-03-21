'use client';

import { useState, useEffect } from 'react';
import type { ActivityFilters, TimeAvailable, IndoorOutdoor, EnergyLevel, Transport } from '@/types';

interface Props {
  onSubmit: (filters: ActivityFilters) => void;
  loading: boolean;
  initialFilters?: ActivityFilters;
  onFiltersChange?: (filters: ActivityFilters) => void;
}

const DEFAULT_FILTERS: ActivityFilters = {
  timeAvailable: 'half-day',
  indoorOutdoor: 'either',
  energyLevel: 'medium',
  transport: 'car',
  budgetPerChild: 15,
  surpriseMe: false,
};

export default function InputForm({ onSubmit, loading, initialFilters, onFiltersChange }: Props) {
  const [filters, setFilters] = useState<ActivityFilters>(initialFilters ?? DEFAULT_FILTERS);

  // Sync if parent changes initialFilters
  useEffect(() => {
    if (initialFilters) setFilters(initialFilters);
  }, [initialFilters]);

  function set<K extends keyof ActivityFilters>(key: K, value: ActivityFilters[K]) {
    setFilters((f) => {
      const next = { ...f, [key]: value };
      onFiltersChange?.(next);
      return next;
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(filters);
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
    >
      {/* Time available */}
      <div>
        <span className="field-label">Time available</span>
        <div className="toggle-group">
          {(
            [
              { value: '1-2h', label: '1–2 hrs', emoji: '⚡' },
              { value: 'half-day', label: 'Half day', emoji: '☀️' },
              { value: 'full-day', label: 'Full day', emoji: '🌟' },
            ] as { value: TimeAvailable; label: string; emoji: string }[]
          ).map((o) => (
            <button
              key={o.value}
              type="button"
              className={`toggle-btn ${filters.timeAvailable === o.value ? 'active' : ''}`}
              onClick={() => set('timeAvailable', o.value)}
            >
              {o.emoji} {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Indoor / outdoor */}
      <div>
        <span className="field-label">Indoor or outdoor?</span>
        <div className="toggle-group">
          {(
            [
              { value: 'indoor', label: 'Indoor', emoji: '🏠' },
              { value: 'either', label: 'Either', emoji: '🌤️' },
              { value: 'outdoor', label: 'Outdoor', emoji: '🌳' },
            ] as { value: IndoorOutdoor; label: string; emoji: string }[]
          ).map((o) => (
            <button
              key={o.value}
              type="button"
              className={`toggle-btn ${filters.indoorOutdoor === o.value ? 'active' : ''}`}
              onClick={() => set('indoorOutdoor', o.value)}
            >
              {o.emoji} {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Energy level */}
      <div>
        <span className="field-label">Energy level today</span>
        <div className="toggle-group">
          {(
            [
              { value: 'low', label: 'Relaxed', emoji: '😌' },
              { value: 'medium', label: 'Active', emoji: '😊' },
              { value: 'high', label: 'Wild!', emoji: '🔥' },
            ] as { value: EnergyLevel; label: string; emoji: string }[]
          ).map((o) => (
            <button
              key={o.value}
              type="button"
              className={`toggle-btn ${filters.energyLevel === o.value ? 'active' : ''}`}
              onClick={() => set('energyLevel', o.value)}
            >
              {o.emoji} {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Transport */}
      <div>
        <span className="field-label">Getting around</span>
        <div className="toggle-group">
          {(
            [
              { value: 'car', label: 'Have a car', emoji: '🚗' },
              { value: 'public', label: 'Public transport', emoji: '🚌' },
            ] as { value: Transport; label: string; emoji: string }[]
          ).map((o) => (
            <button
              key={o.value}
              type="button"
              className={`toggle-btn ${filters.transport === o.value ? 'active' : ''}`}
              onClick={() => set('transport', o.value)}
            >
              {o.emoji} {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Budget */}
      <div>
        <span className="field-label">Budget per child</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            £{filters.budgetPerChild}
          </span>
          <input
            type="range"
            min={0}
            max={30}
            step={5}
            value={filters.budgetPerChild}
            onChange={(e) => set('budgetPerChild', Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--color-orange)', height: 4 }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-faint)', marginTop: 4 }}>
          <span>Free</span>
          <span>£30</span>
        </div>
      </div>

      {/* Surprise me */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px',
          background: filters.surpriseMe ? 'var(--color-orange-light)' : 'var(--color-bg-card)',
          borderRadius: 'var(--radius-button)',
          border: `2px solid ${filters.surpriseMe ? 'var(--color-orange)' : 'var(--color-border)'}`,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        <input
          type="checkbox"
          checked={filters.surpriseMe}
          onChange={(e) => set('surpriseMe', e.target.checked)}
          style={{ display: 'none' }}
        />
        <span style={{ fontSize: 24 }}>🎲</span>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem' }}>
            Surprise me
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            Ignore my usual preferences
          </div>
        </div>
      </label>

      <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: 8 }}>
        {loading ? (
          <>
            <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
            Finding adventures…
          </>
        ) : (
          "Find today's adventures →"
        )}
      </button>
    </form>
  );
}
