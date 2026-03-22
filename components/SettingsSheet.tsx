'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postcodeToCoords } from '@/lib/geocode';
import type {
  ActivityFilters,
  TimeAvailable,
  Transport,
} from '@/types';

interface Props {
  filters: ActivityFilters;
  isManual: boolean;
  locationLabel: string | null;
  onApply: (f: ActivityFilters) => void;
  onSetLocation: (lat: number, lon: number, label: string) => void;
  onClearLocation: () => void;
  onClose: () => void;
}

export default function SettingsSheet({
  filters: initial,
  isManual,
  locationLabel,
  onApply,
  onSetLocation,
  onClearLocation,
  onClose,
}: Props) {
  const router = useRouter();
  const [f, setF] = useState<ActivityFilters>(initial);
  const [postcode, setPostcode] = useState('');
  const [pcLoading, setPcLoading] = useState(false);
  const [pcError, setPcError] = useState<string | null>(null);

  function set<K extends keyof ActivityFilters>(key: K, val: ActivityFilters[K]) {
    setF(prev => ({ ...prev, [key]: val }));
  }

  async function handlePostcode() {
    if (!postcode.trim()) return;
    setPcLoading(true); setPcError(null);
    try {
      const { lat, lon, label } = await postcodeToCoords(postcode.trim());
      onSetLocation(lat, lon, label);
      setPostcode('');
    } catch (err) {
      setPcError(err instanceof Error ? err.message : 'Not found');
    } finally { setPcLoading(false); }
  }

  const changed = JSON.stringify(f) !== JSON.stringify(initial);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
          zIndex: 200, backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
        }}
      />

      {/* Sheet */}
      <div className="animate-slide-up" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        maxHeight: '85dvh', overflowY: 'auto',
        background: '#fff', borderRadius: '24px 24px 0 0',
        zIndex: 201, maxWidth: 480, margin: '0 auto',
        boxShadow: '0 -4px 40px rgba(0,0,0,0.1)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e0e0e0' }} />
        </div>

        <div style={{ padding: '16px 22px max(24px, env(safe-area-inset-bottom))' }}>

          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 24,
          }}>
            <h2 style={{
              margin: 0, fontFamily: 'var(--font-display)',
              fontSize: '1.15rem', fontWeight: 800, color: '#1a1a1a',
            }}>
              Settings
            </h2>
            <button onClick={onClose} style={{
              background: '#f5f5f5', border: 'none', borderRadius: 10,
              width: 34, height: 34, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '1.1rem', color: '#999', cursor: 'pointer',
            }}>
              ×
            </button>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

            <Segmented<TimeAvailable>
              label="Time available"
              value={f.timeAvailable}
              options={[
                { value: '1-2h', label: '1-2 hours' },
                { value: 'half-day', label: 'Half day' },
                { value: 'full-day', label: 'Full day' },
              ]}
              onChange={v => set('timeAvailable', v)}
            />

            <Segmented<Transport>
              label="Transport"
              value={f.transport}
              options={[
                { value: 'car', label: 'Car' },
                { value: 'public', label: 'Bus / train' },
                { value: 'walking', label: 'Walking' },
              ]}
              onChange={v => set('transport', v)}
            />

            {/* Budget */}
            <div>
              <Label>Budget per child · £{f.budgetPerChild}{f.budgetPerChild === 0 ? ' (free only)' : ''}</Label>
              <input
                type="range" min={0} max={30} step={5}
                value={f.budgetPerChild}
                onChange={e => set('budgetPerChild', Number(e.target.value))}
                style={{ width: '100%', accentColor: '#1a1a1a' }}
              />
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: '0.7rem', color: '#ccc', marginTop: 2,
              }}>
                <span>Free</span><span>£30</span>
              </div>
            </div>

            {/* Location */}
            <div>
              <Label>Location</Label>
              {isManual ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', background: '#f0fdf4', borderRadius: 10,
                  marginBottom: 10,
                }}>
                  <span style={{ flex: 1, fontSize: '0.86rem', fontWeight: 600, color: '#16a34a' }}>
                    📍 {locationLabel}
                  </span>
                  <button onClick={onClearLocation} style={{
                    background: 'transparent', border: '1px solid #86efac', borderRadius: 8,
                    padding: '5px 12px', fontSize: '0.74rem', fontWeight: 700,
                    color: '#16a34a', cursor: 'pointer',
                  }}>
                    Use GPS
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: '0.86rem', color: '#999', marginBottom: 10 }}>
                  📍 Using GPS location
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text" value={postcode}
                  onChange={e => setPostcode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handlePostcode()}
                  placeholder="Enter UK postcode"
                  style={{
                    flex: 1, padding: '10px 14px', border: '1.5px solid #e5e5e5',
                    borderRadius: 10, fontSize: '0.9rem', outline: 'none',
                    fontFamily: 'var(--font-body)', letterSpacing: '0.04em',
                    background: '#fff', color: '#1a1a1a',
                  }}
                />
                <button
                  onClick={handlePostcode}
                  disabled={pcLoading || !postcode.trim()}
                  style={{
                    padding: '10px 18px', background: '#1a1a1a', color: '#fff',
                    border: 'none', borderRadius: 10,
                    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.84rem',
                    cursor: pcLoading || !postcode.trim() ? 'default' : 'pointer',
                    opacity: pcLoading || !postcode.trim() ? 0.3 : 1,
                  }}
                >
                  {pcLoading ? '...' : 'Set'}
                </button>
              </div>
              {pcError && (
                <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 }}>
                  {pcError}
                </p>
              )}
            </div>
          </div>

          {/* Manage profiles link */}
          <button
            onClick={() => router.push('/settings')}
            style={{
              marginTop: 24, width: '100%', padding: '13px 0',
              background: 'transparent', border: '1.5px solid #e5e5e5',
              borderRadius: 12,
              fontFamily: 'var(--font-display)', fontWeight: 700,
              fontSize: '0.86rem', color: '#666', cursor: 'pointer',
            }}
          >
            Manage children & preferences
          </button>

          {/* Apply */}
          <button
            onClick={() => onApply(f)}
            style={{
              marginTop: 12, width: '100%', padding: '16px 0',
              background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 14,
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.94rem',
              cursor: 'pointer',
              boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
            }}
          >
            {changed ? 'Apply & refresh' : 'Done'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.7rem',
      color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.08em',
      marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div style={{ display: 'flex', gap: 6 }}>
        {options.map(opt => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              style={{
                flex: 1, padding: '11px 6px', minHeight: 44,
                border: active ? '2px solid #1a1a1a' : '1.5px solid #eee',
                borderRadius: 12,
                background: active ? '#1a1a1a' : '#fff',
                color: active ? '#fff' : '#999',
                fontFamily: 'var(--font-display)', fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer', transition: 'all 0.12s', textAlign: 'center',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
