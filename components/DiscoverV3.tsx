'use client';

/**
 * DiscoverV3 — ground-up rebuild of the discover experience.
 *
 * First principles:
 *  1. The product is "open app, see 3 personalised adventures, pick one"
 *  2. The card IS the product — "why it works for your kids" is the hero
 *  3. Filters are a background concern, not a per-visit interaction
 *  4. Two actions per card: "Let's go" or "Next". That's it.
 *  5. Loading should be invisible — queue serves instantly
 *  6. Information hierarchy: title → why your kids → cost/time → (details on demand)
 *
 * Architecture:
 *  - Single useEffect for init (queue → fallback fresh gen)
 *  - No pull-to-refresh, no swipe mode, no FeedbackModal
 *  - Filters in a minimal drawer, only shown on demand
 *  - "More" button replaces infinite scroll / auto-refresh
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ActivityCardV3 from './ActivityCardV3';
import Navigation from './Navigation';
import { usePreferences } from '@/hooks/usePreferences';
import { useLocation } from '@/hooks/useLocation';
import { loadFilters, saveFilters } from '@/lib/storage';
import { postcodeToCoords } from '@/lib/geocode';
import type {
  ActivityFilters,
  Activity,
  WeatherData,
  GenerateActivitiesRequest,
  TimeAvailable,
  IndoorOutdoor,
  EnergyLevel,
  Transport,
} from '@/types';

const DEFAULT_FILTERS: ActivityFilters = {
  timeAvailable: 'half-day',
  indoorOutdoor: 'either',
  energyLevel: 'medium',
  transport: 'car',
  budgetPerChild: 15,
  surpriseMe: false,
};

const REFILL_THRESHOLD = 7;

interface Props {
  onSwitchVersion: () => void;
}

export default function DiscoverV3({ onSwitchVersion }: Props) {
  const router = useRouter();
  const { prefs, accept, reject, hasChildren, initialized: prefsReady } = usePreferences();

  // Stable refs for async closures
  const prefsRef = useRef(prefs);
  const hasChildrenRef = useRef(hasChildren);
  prefsRef.current = prefs;
  hasChildrenRef.current = hasChildren;

  const { requestLocation, setManualLocation, clearManualLocation, isManual, label: locationLabel } = useLocation();
  const requestLocationRef = useRef(requestLocation);
  requestLocationRef.current = requestLocation;

  // ── State ──────────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<ActivityFilters>(() => loadFilters() ?? DEFAULT_FILTERS);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [queueRemaining, setQueueRemaining] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  // Guards
  const initDone = useRef(false);
  const fillingRef = useRef(false);

  // ── Background fill ────────────────────────────────────────────────────────
  const triggerFill = useCallback(async () => {
    if (fillingRef.current || !prefsRef.current || !hasChildrenRef.current) return;
    fillingRef.current = true;
    let coords: { lat: number; lon: number };
    try { coords = await requestLocationRef.current(); } catch { fillingRef.current = false; return; }
    const body: GenerateActivitiesRequest = {
      filters,
      children: prefsRef.current.children,
      coords,
      recentActivityIds: prefsRef.current.recentActivityIds,
      categoryWeights: filters.surpriseMe
        ? { playground_adventure: 1, museum_mission: 1, soft_play: 1, cheap_cinema: 1, nature_walk: 1, at_home_creative: 1, local_event: 1 }
        : prefsRef.current.categoryWeights,
    };
    try {
      await fetch('/api/activities/queue/fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {} finally { fillingRef.current = false; }
  }, [filters]);

  // ── Pop from queue ─────────────────────────────────────────────────────────
  const popQueue = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/activities/queue');
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.activities?.length) return false;
      setActivities(data.activities);
      if (data.weather) setWeather(data.weather);
      setQueueRemaining(data.eligibleRemaining ?? 0);
      if ((data.eligibleRemaining ?? 0) < REFILL_THRESHOLD) triggerFill();
      return true;
    } catch { return false; }
  }, [triggerFill]);

  // ── Fresh generation (when queue is empty) ─────────────────────────────────
  const fetchFresh = useCallback(async (f: ActivityFilters) => {
    if (!hasChildrenRef.current || !prefsRef.current) { router.push('/settings'); return; }
    setLoading(true);
    let coords: { lat: number; lon: number };
    try { coords = await requestLocationRef.current(); } catch { setLoading(false); return; }
    const body: GenerateActivitiesRequest = {
      filters: f,
      children: prefsRef.current.children,
      coords,
      recentActivityIds: prefsRef.current.recentActivityIds,
      categoryWeights: f.surpriseMe
        ? { playground_adventure: 1, museum_mission: 1, soft_play: 1, cheap_cinema: 1, nature_walk: 1, at_home_creative: 1, local_event: 1 }
        : prefsRef.current.categoryWeights,
    };
    try {
      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.activities?.length) {
        setActivities(data.activities);
        if (data.weather) setWeather(data.weather);
        triggerFill();
      }
    } catch {} finally { setLoading(false); }
  }, [router, triggerFill]);

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (initDone.current) return;
    requestLocationRef.current().catch(() => {}); // warm GPS
    if (hasChildrenRef.current && prefsRef.current) {
      initDone.current = true;
      popQueue().then(got => { if (!got) fetchFresh(filters); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback: prefs arrive after mount (first visit)
  useEffect(() => {
    if (!initDone.current && hasChildren && prefs) {
      initDone.current = true;
      popQueue().then(got => { if (!got) fetchFresh(filters); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasChildren, prefs]);

  // ── Actions ────────────────────────────────────────────────────────────────
  function handleGo(activity: Activity) {
    accept(activity);
    setActivities(prev => prev.filter(a => a.id !== activity.id));
  }

  function handleNext(activity: Activity) {
    reject(activity, 'not_today');
    setActivities(prev => {
      const next = prev.filter(a => a.id !== activity.id);
      if (next.length < 2 && queueRemaining < REFILL_THRESHOLD) triggerFill();
      return next;
    });
  }

  function handleMore() {
    popQueue().then(got => { if (!got) fetchFresh(filters); });
  }

  function handleApplyFilters(f: ActivityFilters) {
    const changed = JSON.stringify(f) !== JSON.stringify(filters);
    setFilters(f);
    saveFilters(f);
    setShowFilters(false);
    if (changed) {
      setActivities([]);
      fetchFresh(f);
    }
  }

  function handlePostcodeSet(lat: number, lon: number, label: string) {
    setManualLocation(lat, lon, label);
    setShowFilters(false);
    if (hasChildren && prefs) fetchFresh(filters);
  }

  function handleClearManual() {
    clearManualLocation();
    setShowFilters(false);
    if (hasChildren && prefs) fetchFresh(filters);
  }

  // ── Weather greeting ───────────────────────────────────────────────────────
  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const weatherLine = weather
    ? `${weather.temperatureCelsius}° ${weather.isRaining ? '& rainy' : '& ' + weather.description}`
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 120px' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{
                fontFamily: 'var(--font-display)', fontWeight: 800,
                fontSize: '1.5rem', margin: 0, color: '#222', letterSpacing: '-0.02em',
              }}>
                {greeting} 👋
              </h1>
              {prefs?.children && prefs.children.length > 0 && (
                <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: '#888' }}>
                  Adventures for {prefs.children.map(c => c.name).join(' & ')}
                </p>
              )}
            </div>
            {weatherLine && (
              <div style={{
                background: '#f5f5f5', borderRadius: 10, padding: '6px 12px',
                fontSize: '0.76rem', fontWeight: 600, color: '#666',
                fontFamily: 'var(--font-display)', whiteSpace: 'nowrap',
              }}>
                {weather?.isRaining ? '🌧' : '☀️'} {weatherLine}
              </div>
            )}
          </div>

          {/* Filter bar */}
          {prefsReady && hasChildren && (
            <button
              onClick={() => setShowFilters(true)}
              style={{
                marginTop: 12, width: '100%',
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px',
                background: '#fafafa', border: '1px solid #eee', borderRadius: 12,
                cursor: 'pointer', overflow: 'hidden',
              }}
            >
              <span style={{ fontSize: '0.78rem', color: '#aaa', flexShrink: 0 }}>⚙</span>
              <div style={{
                display: 'flex', gap: 6, overflow: 'hidden', flex: 1,
              }}>
                {[
                  filters.timeAvailable === '1-2h' ? '1-2h' : filters.timeAvailable === 'half-day' ? 'Half day' : 'Full day',
                  filters.indoorOutdoor === 'either' ? 'Any' : filters.indoorOutdoor,
                  `£${filters.budgetPerChild}`,
                  isManual ? `📍 ${locationLabel}` : '📍 GPS',
                ].map((label, i) => (
                  <span key={i} style={{
                    fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--font-display)',
                    color: '#999', background: '#f0f0f0', padding: '3px 8px',
                    borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {label}
                  </span>
                ))}
              </div>
              <span style={{ fontSize: '0.72rem', color: '#ccc', flexShrink: 0 }}>Edit</span>
            </button>
          )}
        </div>

        {/* ── Setup nudge ── */}
        {prefsReady && !hasChildren && !loading && (
          <div style={{
            background: '#f0fdf4', border: '1px solid #bbf7d0',
            borderRadius: 14, padding: '20px', textAlign: 'center',
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🧒</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, margin: '0 0 6px' }}>
              Add your children first
            </h2>
            <p style={{ color: '#666', fontSize: '0.88rem', marginBottom: 14 }}>
              We personalise every suggestion to your kids&apos; ages and interests.
            </p>
            <button
              className="btn-primary"
              onClick={() => router.push('/settings')}
              style={{ background: '#16a34a' }}
            >
              Set up profiles
            </button>
          </div>
        )}

        {/* ── Loading ── */}
        {(!prefsReady || loading) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{
                height: 280, borderRadius: 16,
              }} />
            ))}
          </div>
        )}

        {/* ── Cards ── */}
        {!loading && activities.length > 0 && (
          <>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 12,
            }}>
              <span style={{
                fontFamily: 'var(--font-display)', fontWeight: 800,
                fontSize: '0.82rem', color: '#bbb', textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                Today&apos;s picks
              </span>
              {queueRemaining > 0 && (
                <span style={{ fontSize: '0.72rem', color: '#ccc' }}>
                  {queueRemaining} more queued
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {activities.map(a => (
                <ActivityCardV3
                  key={a.id}
                  activity={a}
                  onGo={handleGo}
                  onNext={handleNext}
                />
              ))}
            </div>

            {/* More button */}
            <button
              onClick={handleMore}
              style={{
                marginTop: 16, width: '100%', padding: '14px 0',
                background: '#f5f5f5', border: 'none', borderRadius: 12,
                fontFamily: 'var(--font-display)', fontWeight: 700,
                fontSize: '0.88rem', color: '#888', cursor: 'pointer',
              }}
            >
              Show me more →
            </button>
          </>
        )}

        {/* ── Empty state ── */}
        {!loading && prefsReady && hasChildren && activities.length === 0 && (
          <div style={{
            background: '#fff', borderRadius: 16, padding: '40px 24px',
            textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, margin: '0 0 8px' }}>
              Ready for more?
            </h2>
            <p style={{ color: '#888', fontSize: '0.88rem', marginBottom: 20 }}>
              You&apos;ve seen today&apos;s batch. Tap below for fresh ideas.
            </p>
            <button
              onClick={handleMore}
              style={{
                padding: '14px 32px', background: '#222', color: '#fff',
                border: 'none', borderRadius: 12, fontFamily: 'var(--font-display)',
                fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer',
              }}
            >
              Find more adventures
            </button>
          </div>
        )}

        {/* ── Version toggle ── */}
        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <button
            onClick={onSwitchVersion}
            style={{
              background: 'none', border: 'none', fontSize: '0.7rem',
              color: '#ccc', cursor: 'pointer', textDecoration: 'underline',
              textDecorationStyle: 'dotted', padding: '4px 8px',
            }}
          >
            Switch to classic view
          </button>
        </div>
      </div>

      <Navigation />

      {/* ── Filter drawer ── */}
      {showFilters && (
        <FilterDrawer
          filters={filters}
          isManual={isManual}
          locationLabel={locationLabel}
          onApply={handleApplyFilters}
          onSetLocation={handlePostcodeSet}
          onClearLocation={handleClearManual}
          onClose={() => setShowFilters(false)}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FilterDrawer — minimal, built-in
// ═══════════════════════════════════════════════════════════════════════════════

function FilterDrawer({
  filters: initial,
  isManual,
  locationLabel,
  onApply,
  onSetLocation,
  onClearLocation,
  onClose,
}: {
  filters: ActivityFilters;
  isManual: boolean;
  locationLabel: string | null;
  onApply: (f: ActivityFilters) => void;
  onSetLocation: (lat: number, lon: number, label: string) => void;
  onClearLocation: () => void;
  onClose: () => void;
}) {
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

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
        zIndex: 200, backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
      }} />

      {/* Drawer */}
      <div className="animate-slide-up" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        maxHeight: '85dvh', overflowY: 'auto',
        background: '#fff', borderRadius: '20px 20px 0 0',
        zIndex: 201, maxWidth: 480, margin: '0 auto',
        boxShadow: '0 -4px 30px rgba(0,0,0,0.12)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#ddd' }} />
        </div>

        <div style={{ padding: '12px 20px max(24px, env(safe-area-inset-bottom))' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800 }}>
              Filters
            </h2>
            <button onClick={onClose} style={{
              background: '#f5f5f5', border: 'none', borderRadius: 8,
              width: 32, height: 32, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '1rem', color: '#999', cursor: 'pointer',
            }}>×</button>
          </div>

          {/* Segmented controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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

            <Segmented<IndoorOutdoor>
              label="Indoor / Outdoor"
              value={f.indoorOutdoor}
              options={[
                { value: 'indoor', label: 'Indoor' },
                { value: 'either', label: 'Either' },
                { value: 'outdoor', label: 'Outdoor' },
              ]}
              onChange={v => set('indoorOutdoor', v)}
            />

            <Segmented<EnergyLevel>
              label="Energy level"
              value={f.energyLevel}
              options={[
                { value: 'low', label: 'Chill' },
                { value: 'medium', label: 'Active' },
                { value: 'high', label: 'High energy' },
              ]}
              onChange={v => set('energyLevel', v)}
            />

            <Segmented<Transport>
              label="Transport"
              value={f.transport}
              options={[
                { value: 'car', label: 'Car' },
                { value: 'public', label: 'Bus/train' },
                { value: 'walking', label: 'Walking' },
              ]}
              onChange={v => set('transport', v)}
            />

            {/* Budget */}
            <div>
              <DrawerLabel>Budget per child · £{f.budgetPerChild}{f.budgetPerChild === 0 ? ' (free)' : ''}</DrawerLabel>
              <input
                type="range" min={0} max={30} step={5}
                value={f.budgetPerChild}
                onChange={e => set('budgetPerChild', Number(e.target.value))}
                style={{ width: '100%', accentColor: '#222' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#ccc', marginTop: 2 }}>
                <span>Free</span><span>£30</span>
              </div>
            </div>

            {/* Location */}
            <div>
              <DrawerLabel>Location</DrawerLabel>
              {isManual ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, marginBottom: 8 }}>
                  <span style={{ flex: 1, fontSize: '0.84rem', fontWeight: 600, color: '#16a34a' }}>
                    📍 {locationLabel}
                  </span>
                  <button onClick={onClearLocation} style={{
                    background: 'transparent', border: '1px solid #86efac', borderRadius: 6,
                    padding: '5px 10px', fontSize: '0.72rem', fontWeight: 700, color: '#16a34a', cursor: 'pointer',
                  }}>
                    Use GPS
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: '0.84rem', color: '#999', marginBottom: 8 }}>
                  📍 Using GPS location
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text" value={postcode}
                  onChange={e => setPostcode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handlePostcode()}
                  placeholder="UK postcode"
                  className="text-input"
                  style={{ flex: 1, minHeight: 40, padding: '8px 12px', fontSize: '0.88rem', letterSpacing: '0.04em' }}
                />
                <button
                  onClick={handlePostcode}
                  disabled={pcLoading || !postcode.trim()}
                  style={{
                    padding: '8px 16px', background: '#222', color: '#fff',
                    border: 'none', borderRadius: 'var(--radius-button)',
                    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.82rem',
                    cursor: pcLoading || !postcode.trim() ? 'default' : 'pointer',
                    opacity: pcLoading || !postcode.trim() ? 0.3 : 1,
                  }}
                >
                  {pcLoading ? '...' : 'Set'}
                </button>
              </div>
              {pcError && <p style={{ margin: '6px 0 0', fontSize: '0.76rem', color: '#dc2626', fontWeight: 600 }}>{pcError}</p>}
            </div>
          </div>

          {/* Apply */}
          <button
            onClick={() => onApply(f)}
            style={{
              marginTop: 24, width: '100%', padding: '15px 0',
              background: '#222', color: '#fff', border: 'none', borderRadius: 12,
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.92rem',
              cursor: 'pointer',
            }}
          >
            {JSON.stringify(f) !== JSON.stringify(initial) ? 'Apply & refresh' : 'Done'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Shared drawer helpers ────────────────────────────────────────────────────

function DrawerLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.68rem',
      color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
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
      <DrawerLabel>{label}</DrawerLabel>
      <div style={{ display: 'flex', gap: 6 }}>
        {options.map(opt => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              style={{
                flex: 1, padding: '10px 6px', minHeight: 44,
                border: active ? '2px solid #222' : '1.5px solid #eee',
                borderRadius: 10,
                background: active ? '#222' : '#fff',
                color: active ? '#fff' : '#999',
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.78rem',
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
