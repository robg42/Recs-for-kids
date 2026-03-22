'use client';

/**
 * Discover — the entire product in one screen.
 *
 * Visual language: immersive, editorial, typography-driven.
 * Space Grotesk for display, DM Sans for body.
 * Dark hero images, clean content sections, no cards or pills.
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

  const [filters, setFilters] = useState<ActivityFilters>(() => loadFilters() ?? DEFAULT_FILTERS);
  const [queue, setQueue] = useState<Activity[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [queueRemaining, setQueueRemaining] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [transitionKey, setTransitionKey] = useState(0);

  const initDone = useRef(false);
  const fillingRef = useRef(false);

  const current = queue[0] ?? null;

  // ── Data fetching (unchanged logic) ──────────────────────────────────────
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

  useEffect(() => {
    if (initDone.current) return;
    requestLocationRef.current().catch(() => {});
    if (hasChildrenRef.current && prefsRef.current) {
      initDone.current = true;
      popQueue().then(got => { if (!got) fetchFresh(filters); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        popQueue();
      } else if (next.length === 0) {
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

        {/* ── Top bar — minimal, transparent feel ── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 0 4px',
        }}>
          <a
            href="/?legacy=1"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: 'var(--font-dm), var(--font-body)',
              fontSize: '0.72rem', color: '#bbb', textDecoration: 'none',
              fontWeight: 500, letterSpacing: '0.02em',
            }}
          >
            Classic view ↗
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {weather && (
              <span style={{
                fontFamily: 'var(--font-dm), var(--font-body)',
                fontSize: '0.82rem', color: '#999', fontWeight: 500,
              }}>
                {weather.isRaining ? '🌧' : '☀️'} {weather.temperatureCelsius}°
              </span>
            )}
            <button
              onClick={() => setShowSettings(true)}
              aria-label="Settings"
              style={{
                background: 'none', border: '1.5px solid #e5e5e5',
                width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: '0.9rem', color: '#aaa',
              }}
            >
              ⚙
            </button>
          </div>
        </div>

        {/* ── Greeting ── */}
        <div style={{ marginBottom: 20, paddingTop: 12 }}>
          <h1 style={{
            margin: 0,
            fontFamily: 'var(--font-space), var(--font-display)',
            fontWeight: 700, fontSize: '1.8rem', color: '#1a1a1a',
            letterSpacing: '-0.04em', lineHeight: 1.1,
          }}>
            {greeting}.
          </h1>
          {prefsReady && hasChildren && prefs?.children && (
            <p style={{
              margin: '8px 0 0',
              fontFamily: 'var(--font-dm), var(--font-body)',
              fontSize: '0.95rem', color: '#999',
              lineHeight: 1.4, fontWeight: 400,
            }}>
              {current
                ? `Here\u2019s today\u2019s pick for ${prefs.children.map(c => c.name).join(' & ')}.`
                : loading
                  ? 'Finding something perfect...'
                  : 'Ready when you are.'}
            </p>
          )}
        </div>

        {/* ── Setup nudge ── */}
        {prefsReady && !hasChildren && !loading && (
          <div style={{
            marginTop: 40, textAlign: 'center',
            padding: '0 8px',
          }}>
            <div style={{
              fontFamily: 'var(--font-space), var(--font-display)',
              fontSize: '1.6rem', fontWeight: 700,
              color: '#1a1a1a', letterSpacing: '-0.03em',
              lineHeight: 1.15, marginBottom: 12,
            }}>
              Tell us about<br />your kids.
            </div>
            <p style={{
              fontFamily: 'var(--font-dm), var(--font-body)',
              color: '#999', fontSize: '0.95rem',
              marginBottom: 28, lineHeight: 1.5,
            }}>
              We&apos;ll use their ages and interests to find activities they&apos;ll actually love.
            </p>
            <button
              onClick={() => router.push('/settings')}
              style={{
                padding: '16px 40px', background: '#1a1a1a', color: '#fff',
                border: 'none',
                fontFamily: 'var(--font-space), var(--font-display)',
                fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                letterSpacing: '-0.01em',
              }}
            >
              Get started
            </button>
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {(loading || !prefsReady) && hasChildren !== false && (
          <div>
            {/* Hero skeleton — full bleed */}
            <div className="skeleton" style={{
              width: 'calc(100% + 32px)', marginLeft: -16,
              height: '50vh', minHeight: 300,
            }} />
            <div style={{ height: 3, background: '#e0e0e0' }} />
            <div style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="skeleton" style={{ height: 18, width: '70%' }} />
              <div className="skeleton" style={{ height: 14, width: '90%' }} />
              <div className="skeleton" style={{ height: 14, width: '80%' }} />
              <div style={{ height: 16 }} />
              <div className="skeleton" style={{ height: 14, width: '50%' }} />
              <div className="skeleton" style={{ height: 14, width: '95%' }} />
              <div className="skeleton" style={{ height: 14, width: '85%' }} />
              <div style={{ height: 16 }} />
              <div className="skeleton" style={{ height: 52 }} />
              <div className="skeleton" style={{ height: 48 }} />
            </div>
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
            marginTop: 60, textAlign: 'center',
            padding: '0 8px',
          }}>
            <div style={{
              fontFamily: 'var(--font-space), var(--font-display)',
              fontSize: '1.4rem', fontWeight: 700,
              color: '#1a1a1a', letterSpacing: '-0.03em',
              lineHeight: 1.15, marginBottom: 12,
            }}>
              Ready for more?
            </div>
            <p style={{
              fontFamily: 'var(--font-dm), var(--font-body)',
              color: '#999', fontSize: '0.92rem',
              marginBottom: 28, lineHeight: 1.5,
            }}>
              You&apos;ve seen today&apos;s picks. Tap below for fresh ideas.
            </p>
            <button
              onClick={() => popQueue().then(got => { if (!got) fetchFresh(filters); })}
              style={{
                padding: '16px 40px', background: '#1a1a1a', color: '#fff',
                border: 'none',
                fontFamily: 'var(--font-space), var(--font-display)',
                fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                letterSpacing: '-0.01em',
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
