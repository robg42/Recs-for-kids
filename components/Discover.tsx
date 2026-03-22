'use client';

/**
 * Discover — the entire product in one screen.
 *
 * Model: ONE suggestion at a time. The user's only decision is
 * "Let's do this" or "Show me another."
 *
 * Data flow: queue (instant) → cached fallback → fresh generation.
 * Background fill keeps the queue topped up.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ActivityView from './ActivityView';
import SettingsSheet from './SettingsSheet';
import { usePreferences } from '@/hooks/usePreferences';
import { useLocation } from '@/hooks/useLocation';
import { loadFilters, saveFilters } from '@/lib/storage';
import type {
  ActivityFilters,
  Activity,
  WeatherData,
  GenerateActivitiesRequest,
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

export default function Discover() {
  const router = useRouter();
  const { prefs, accept, reject, hasChildren, initialized: prefsReady } = usePreferences();

  // Stable refs for async closures
  const prefsRef = useRef(prefs);
  const hasChildrenRef = useRef(hasChildren);
  prefsRef.current = prefs;
  hasChildrenRef.current = hasChildren;

  const {
    requestLocation, setManualLocation, clearManualLocation,
    isManual, label: locationLabel,
  } = useLocation();
  const requestLocationRef = useRef(requestLocation);
  requestLocationRef.current = requestLocation;

  // ── State ──────────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<ActivityFilters>(() => loadFilters() ?? DEFAULT_FILTERS);
  const [queue, setQueue] = useState<Activity[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [queueRemaining, setQueueRemaining] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [transitionKey, setTransitionKey] = useState(0); // forces re-mount for animation

  // Guards
  const initDone = useRef(false);
  const fillingRef = useRef(false);

  // Current activity = first in queue
  const current = queue[0] ?? null;

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
      setQueue(data.activities);
      if (data.weather) setWeather(data.weather);
      setQueueRemaining(data.eligibleRemaining ?? 0);
      if ((data.eligibleRemaining ?? 0) < REFILL_THRESHOLD) triggerFill();
      return true;
    } catch { return false; }
  }, [triggerFill]);

  // ── Fresh generation ───────────────────────────────────────────────────────
  const fetchFresh = useCallback(async (f: ActivityFilters) => {
    if (!hasChildrenRef.current || !prefsRef.current) return;
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
        setQueue(data.activities);
        if (data.weather) setWeather(data.weather);
        triggerFill();
      }
    } catch {} finally { setLoading(false); }
  }, [triggerFill]);

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

  // Fallback: prefs arrive after mount
  useEffect(() => {
    if (!initDone.current && hasChildren && prefs) {
      initDone.current = true;
      popQueue().then(got => { if (!got) fetchFresh(filters); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasChildren, prefs]);

  // ── Actions ────────────────────────────────────────────────────────────────
  function handleAccept() {
    if (!current) return;
    accept(current);
    advance();
  }

  function handleNext() {
    if (!current) return;
    reject(current, 'not_today');
    advance();
  }

  function advance() {
    setQueue(prev => {
      const next = prev.slice(1);
      if (next.length < 2 && queueRemaining >= REFILL_THRESHOLD) {
        // Get more from queue
        popQueue();
      } else if (next.length === 0) {
        // Queue empty — fetch fresh
        popQueue().then(got => { if (!got) fetchFresh(filters); });
      } else if (next.length < 2) {
        triggerFill();
      }
      return next;
    });
    setTransitionKey(k => k + 1);
  }

  function handleApplyFilters(f: ActivityFilters) {
    const changed = JSON.stringify(f) !== JSON.stringify(filters);
    setFilters(f);
    saveFilters(f);
    setShowSettings(false);
    if (changed) {
      setQueue([]);
      fetchFresh(f);
    }
  }

  function handlePostcodeSet(lat: number, lon: number, label: string) {
    setManualLocation(lat, lon, label);
    setShowSettings(false);
    if (hasChildren && prefs) fetchFresh(filters);
  }

  function handleClearManual() {
    clearManualLocation();
    setShowSettings(false);
    if (hasChildren && prefs) fetchFresh(filters);
  }

  // ── Greeting ───────────────────────────────────────────────────────────────
  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div style={{
        maxWidth: 480, margin: '0 auto',
        padding: '0 16px max(32px, env(safe-area-inset-bottom))',
        minHeight: '100dvh',
      }}>

        {/* ── Top utility bar ── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 0 8px',
        }}>
          <a
            href="/?legacy=1"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '0.7rem', color: '#ccc', textDecoration: 'none',
              fontFamily: 'var(--font-display)', fontWeight: 600,
            }}
          >
            Classic view ↗
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {weather && (
              <span style={{
                fontSize: '0.78rem', color: '#999', fontWeight: 600,
                fontFamily: 'var(--font-display)',
              }}>
                {weather.isRaining ? '🌧' : '☀️'} {weather.temperatureCelsius}°
              </span>
            )}
            <button
              onClick={() => setShowSettings(true)}
              style={{
                background: '#f5f5f5', border: 'none', borderRadius: 10,
                width: 36, height: 36, display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer',
                fontSize: '1rem', color: '#999',
              }}
              aria-label="Settings"
            >
              ⚙
            </button>
          </div>
        </div>

        {/* ── Greeting ── */}
        <div style={{ marginBottom: 24, paddingTop: 8 }}>
          <h1 style={{
            margin: 0, fontFamily: 'var(--font-display)', fontWeight: 800,
            fontSize: '1.6rem', color: '#1a1a1a', letterSpacing: '-0.02em',
            lineHeight: 1.2,
          }}>
            {greeting} 👋
          </h1>
          {prefsReady && hasChildren && prefs?.children && (
            <p style={{
              margin: '6px 0 0', fontSize: '0.92rem', color: '#999',
              lineHeight: 1.4,
            }}>
              {current
                ? 'Here\u2019s a great adventure for today.'
                : loading
                  ? 'Finding the perfect activity...'
                  : 'Let\u2019s find something fun to do.'}
            </p>
          )}
        </div>

        {/* ── Setup nudge (no children) ── */}
        {prefsReady && !hasChildren && !loading && (
          <div style={{
            background: '#fff', borderRadius: 20, padding: '40px 24px',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
            marginTop: 20,
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🧒</div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: '1.2rem',
              fontWeight: 800, margin: '0 0 8px', color: '#1a1a1a',
            }}>
              Welcome to Adventure Time!
            </h2>
            <p style={{
              color: '#888', fontSize: '0.92rem', marginBottom: 20,
              lineHeight: 1.5,
            }}>
              Tell us about your kids and we&apos;ll find perfect activities
              tailored to their ages and interests.
            </p>
            <button
              onClick={() => router.push('/settings')}
              style={{
                padding: '14px 32px', background: '#1a1a1a', color: '#fff',
                border: 'none', borderRadius: 14,
                fontFamily: 'var(--font-display)', fontWeight: 800,
                fontSize: '0.94rem', cursor: 'pointer',
                boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
              }}
            >
              Get started
            </button>
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {(loading || !prefsReady) && hasChildren !== false && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="skeleton" style={{ height: 280, borderRadius: 20 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="skeleton" style={{ height: 28, width: 60, borderRadius: 8 }} />
              <div className="skeleton" style={{ height: 28, width: 80, borderRadius: 8 }} />
              <div className="skeleton" style={{ height: 28, width: 70, borderRadius: 8 }} />
            </div>
            <div className="skeleton" style={{ height: 16, width: '60%', borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 80, borderRadius: 12 }} />
            <div className="skeleton" style={{ height: 80, borderRadius: 12 }} />
            <div className="skeleton" style={{ height: 50, borderRadius: 14 }} />
          </div>
        )}

        {/* ── Current activity ── */}
        {!loading && current && prefs && (
          <ActivityView
            key={transitionKey}
            activity={current}
            onAccept={handleAccept}
            onNext={handleNext}
          />
        )}

        {/* ── Empty state ── */}
        {!loading && prefsReady && hasChildren && !current && queue.length === 0 && (
          <div style={{
            background: '#fff', borderRadius: 20, padding: '40px 24px',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
            marginTop: 20,
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: '1.15rem',
              fontWeight: 800, margin: '0 0 8px', color: '#1a1a1a',
            }}>
              Ready for more?
            </h2>
            <p style={{
              color: '#888', fontSize: '0.9rem', marginBottom: 20,
              lineHeight: 1.5,
            }}>
              You&apos;ve seen today&apos;s picks. Tap below for fresh ideas.
            </p>
            <button
              onClick={() => popQueue().then(got => { if (!got) fetchFresh(filters); })}
              style={{
                padding: '14px 32px', background: '#1a1a1a', color: '#fff',
                border: 'none', borderRadius: 14,
                fontFamily: 'var(--font-display)', fontWeight: 800,
                fontSize: '0.94rem', cursor: 'pointer',
                boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
              }}
            >
              Find more adventures
            </button>
          </div>
        )}
      </div>

      {/* ── Settings sheet ── */}
      {showSettings && (
        <SettingsSheet
          filters={filters}
          isManual={isManual}
          locationLabel={locationLabel}
          onApply={handleApplyFilters}
          onSetLocation={handlePostcodeSet}
          onClearLocation={handleClearManual}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}
