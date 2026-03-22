'use client';

import { useState } from 'react';
import { postcodeToCoords } from '@/lib/geocode';
import type { ActivityFilters, TimeAvailable, IndoorOutdoor, EnergyLevel, Transport } from '@/types';

interface Props {
  filters: ActivityFilters;
  isManual: boolean;
  locationLabel: string | null;
  onApply: (filters: ActivityFilters) => void;
  onSetManualLocation: (lat: number, lon: number, label: string) => void;
  onClearManualLocation: () => void;
  onClose: () => void;
}

export default function FilterSheet({
  filters: initial,
  isManual,
  locationLabel,
  onApply,
  onSetManualLocation,
  onClearManualLocation,
  onClose,
}: Props) {
  const [local, setLocal] = useState<ActivityFilters>(initial);
  const [postcode, setPostcode] = useState('');
  const [postcodeLoading, setPostcodeLoading] = useState(false);
  const [postcodeError, setPostcodeError] = useState<string | null>(null);

  function set<K extends keyof ActivityFilters>(key: K, value: ActivityFilters[K]) {
    setLocal(f => ({ ...f, [key]: value }));
  }

  const changed = JSON.stringify(local) !== JSON.stringify(initial);

  async function handlePostcodeSet() {
    if (!postcode.trim()) return;
    setPostcodeLoading(true);
    setPostcodeError(null);
    try {
      const { lat, lon, label } = await postcodeToCoords(postcode.trim());
      onSetManualLocation(lat, lon, label);
      setPostcode('');
    } catch (err) {
      setPostcodeError(err instanceof Error ? err.message : 'Could not find postcode');
    } finally {
      setPostcodeLoading(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
      />

      {/* Sheet */}
      <div
        className="animate-slide-up"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          maxHeight: '88dvh',
          background: 'var(--color-bg-card)',
          borderRadius: '14px 14px 0 0',
          zIndex: 201,
          overflowY: 'auto',
          maxWidth: 480,
          margin: '0 auto',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
        </div>

        <div style={{ padding: '12px 20px max(24px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800 }}>Filters</h2>
            <button
              onClick={onClose}
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 4, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', color: 'var(--color-text-muted)', cursor: 'pointer' }}
            >
              ×
            </button>
          </div>

          {/* Time */}
          <Field label="How long have you got?">
            <Seg<TimeAvailable>
              value={local.timeAvailable}
              options={[
                { value: '1-2h', label: '⚡ 1–2 hrs' },
                { value: 'half-day', label: '☀️ Half day' },
                { value: 'full-day', label: '🌟 Full day' },
              ]}
              onChange={v => set('timeAvailable', v)}
            />
          </Field>

          {/* Indoor/outdoor */}
          <Field label="Inside or outside?">
            <Seg<IndoorOutdoor>
              value={local.indoorOutdoor}
              options={[
                { value: 'indoor', label: '🏠 Indoor' },
                { value: 'either', label: '🔀 Either' },
                { value: 'outdoor', label: '🌿 Outdoor' },
              ]}
              onChange={v => set('indoorOutdoor', v)}
            />
          </Field>

          {/* Energy */}
          <Field label="Energy level">
            <Seg<EnergyLevel>
              value={local.energyLevel}
              options={[
                { value: 'low', label: '🌀 Relaxed' },
                { value: 'medium', label: '🚀 Active' },
                { value: 'high', label: '⚡ Wild' },
              ]}
              onChange={v => set('energyLevel', v)}
            />
          </Field>

          {/* Transport */}
          <Field label="Getting there by">
            <Seg<Transport>
              value={local.transport}
              options={[
                { value: 'car', label: '🚗 Car' },
                { value: 'public', label: '🚌 Bus' },
                { value: 'walking', label: '🚶 Walking' },
              ]}
              onChange={v => set('transport', v)}
            />
          </Field>

          {/* Budget */}
          <Field label={`Budget per child · £${local.budgetPerChild}${local.budgetPerChild === 0 ? ' (free only)' : ''}`}>
            <input
              type="range"
              min={0} max={30} step={5}
              value={local.budgetPerChild}
              onChange={e => set('budgetPerChild', Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-brand)', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--color-text-faint)', marginTop: 3 }}>
              <span>Free</span><span>£30</span>
            </div>
          </Field>

          {/* Surprise me */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.92rem' }}>✨ Surprise me</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>Ignore my category preferences</div>
            </div>
            <button
              onClick={() => set('surpriseMe', !local.surpriseMe)}
              style={{
                width: 46, height: 26, borderRadius: 13, border: 'none',
                background: local.surpriseMe ? 'var(--color-brand)' : 'var(--color-border)',
                cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s',
              }}
            >
              <div style={{
                position: 'absolute', top: 3, width: 20, height: 20, borderRadius: 10,
                background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                left: local.surpriseMe ? 23 : 3, transition: 'left 0.2s',
              }} />
            </button>
          </div>

          {/* Location */}
          <Field label="Location">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {isManual ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--color-brand-light)', borderRadius: 6 }}>
                  <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-brand)', fontFamily: 'var(--font-display)' }}>
                    📍 {locationLabel}
                  </span>
                  <button
                    onClick={onClearManualLocation}
                    style={{ background: 'transparent', border: '1px solid var(--color-brand-mid)', borderRadius: 4, padding: '5px 10px', fontSize: '0.75rem', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--color-brand)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Use GPS
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', padding: '4px 0' }}>
                  📍 Using your current GPS location
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={postcode}
                  onChange={e => setPostcode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handlePostcodeSet()}
                  placeholder="Enter UK postcode to set area"
                  className="text-input"
                  style={{ flex: 1, minHeight: 40, padding: '8px 12px', letterSpacing: '0.06em', fontSize: '0.9rem' }}
                />
                <button
                  onClick={handlePostcodeSet}
                  disabled={postcodeLoading || !postcode.trim()}
                  style={{
                    padding: '8px 14px', background: 'var(--color-brand)', color: '#fff',
                    border: 'none', borderRadius: 4, fontFamily: 'var(--font-display)', fontWeight: 700,
                    fontSize: '0.82rem', cursor: postcodeLoading || !postcode.trim() ? 'default' : 'pointer',
                    opacity: postcodeLoading || !postcode.trim() ? 0.4 : 1, whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  {postcodeLoading ? '…' : 'Set'}
                </button>
              </div>
              {postcodeError && (
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-rose)', fontWeight: 600 }}>{postcodeError}</p>
              )}
            </div>
          </Field>

          {/* Apply */}
          <button
            className="btn-primary"
            style={{ width: '100%' }}
            onClick={() => onApply(local)}
          >
            {changed ? 'Apply & refresh picks' : 'Done'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.68rem', color: 'var(--color-text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Seg<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1, padding: '10px 6px', minHeight: 44,
            border: `1.5px solid ${value === opt.value ? 'var(--color-brand)' : 'var(--color-border)'}`,
            borderRadius: 4,
            background: value === opt.value ? 'var(--color-brand-light)' : 'var(--color-bg-card)',
            color: value === opt.value ? 'var(--color-brand)' : 'var(--color-text-muted)',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.78rem',
            cursor: 'pointer', transition: 'all 0.12s', textAlign: 'center',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
