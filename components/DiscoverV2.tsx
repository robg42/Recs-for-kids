'use client';

/**
 * DiscoverV2 — redesigned discover page.
 *
 * Key differences from V1:
 *  - No list/stack mode toggle: always card list
 *  - No pull-to-refresh gesture: explicit "Next picks" button
 *  - No FeedbackModal: skip is a single tap
 *  - No activity_cache calls: queue-only serving
 *  - Filters in a proper bottom sheet (FilterSheet)
 *  - Pass button visible on collapsed card (no expand required to dismiss)
 *  - "Why it works for your kids" visually foregrounded
 *  - "Browse saved suggestions" expandable below picks
 *  - Single focused state machine (~12 state variables vs V1's 20+)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ActivityCardV2 from './ActivityCardV2';
import FilterSheet from './FilterSheet';
import WeatherBadge from './WeatherBadge';
import Navigation from './Navigation';
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

interface Props {
  onSwitchVersion: () => void;
}

export default function DiscoverV2({ onSwitchVersion }: Props) {
  const router = useRouter();
  const { prefs, accept, reject, hasChildren, initialized: prefsReady } = usePreferences();

  // Always-current refs — prevent stale closures in async callbacks
  const hasChildrenRef = useRef(hasChildren);
  const prefsRef = useRef(prefs);
  hasChildrenRef.current = hasChildren;
  prefsRef.current = prefs;

  const {
    requestLocation,
    setManualLocation,
    clearManualLocation,
    isManual,
    label: locationLabel,
  } = useLocation();
  const requestLocationRef = useRef(requestLocation);
  requestLocationRef.current = requestLocation;

  // ── Core state ─────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<ActivityFilters>(() => loadFilters() ?? DEFAULT_FILTERS);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [queueRemaining, setQueueRemaining] = useState(0);
  const [isStale, setIsStale] = useState(false);

  // ── UI overlay state ───────────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);

  // ── Guards ─────────────────────────────────────────────────────────────────
  const autoFetchedRef = useRef(false);
  const fillingRef = useRef(false);

  // ── Background queue fill ──────────────────────────────────────────────────
  const triggerFill = useCallback(async () => {
    if (fillingRef.current || !prefsRef.current || !hasChildrenRef.current) return;
    fillingRef.current = true;
    let coords: { lat: number; lon: number };
    try {
      coords = await requestLocationRef.current();
    } catch {
      fillingRef.current = false;
      return;
    }
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
    } catch { /* silent — background op */ } finally {
      fillingRef.current = false;
    }
  }, [filters]);

  // ── Pop next batch from queue ──────────────────────────────────────────────
  const popFromQueue = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/activities/queue');
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.activities?.length) return false;
      setActivities(data.activities);
      if (data.weather) setWeather(data.weather);
      setQueueRemaining(data.eligibleRemaining ?? 0);
      setIsStale(data.isStale === true);
      if (data.isStale || (data.eligibleRemaining ?? 0) < REFILL_THRESHOLD) triggerFill();
      return true;
    } catch {
      return false;
    }
  }, [triggerFill]);

  // ── Fresh generation (fallback when queue is empty) ────────────────────────
  const fetchFresh = useCallback(async (currentFilters: ActivityFilters) => {
    if (!hasChildrenRef.current || !prefsRef.current) {
      router.push('/settings');
      return;
    }
    setLoading(true);
    let coords: { lat: number; lon: number };
    try {
      coords = await requestLocationRef.current();
    } catch {
      setLoading(false);
      return;
    }
    const body: GenerateActivitiesRequest = {
      filters: currentFilters,
      children: prefsRef.current.children,
      coords,
      recentActivityIds: prefsRef.current.recentActivityIds,
      categoryWeights: currentFilters.surpriseMe
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
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [router, triggerFill]);

  // ── Init on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      autoFetchedRef.current = true;
      requestLocationRef.current().catch(() => {}); // warm up GPS
      const gotQueue = await popFromQueue();
      if (!gotQueue && hasChildrenRef.current && prefsRef.current) {
        fetchFresh(filters);
      }
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fallback: auto-fetch once prefs become available (first-ever visit) ────
  useEffect(() => {
    if (!autoFetchedRef.current && hasChildren && prefs) {
      autoFetchedRef.current = true;
      popFromQueue().then(got => { if (!got) fetchFresh(filters); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasChildren, prefs]);

  // ── Action handlers ────────────────────────────────────────────────────────
  function handleAccept(activity: Activity) {
    accept(activity);
    removeFromAll(activity.id);
    setActivities(prev => {
      const next = prev.filter(a => a.id !== activity.id);
      if (next.length < 2 && queueRemaining < REFILL_THRESHOLD) triggerFill();
      return next;
    });
  }

  function handleSkip(activity: Activity) {
    reject(activity, 'not_today');
    removeFromAll(activity.id);
    setActivities(prev => {
      const next = prev.filter(a => a.id !== activity.id);
      if (next.length < 2 && queueRemaining < REFILL_THRESHOLD) triggerFill();
      return next;
    });
  }

  function removeFromAll(id: string) {
    setAllActivities(prev => prev.filter(a => a.id !== id));
  }

  function handleNextPicks() {
    setShowAll(false);
    setAllActivities([]);
    popFromQueue().then(got => { if (!got) fetchFresh(filters); });
  }

  function handleFiltersApply(newFilters: ActivityFilters) {
    setFilters(newFilters);
    saveFilters(newFilters);
    setShowFilters(false);
    setShowAll(false);
    setAllActivities([]);
    setActivities([]);
    fetchFresh(newFilters);
  }

  function handleSetManualLocation(lat: number, lon: number, label: string) {
    setManualLocation(lat, lon, label);
    setShowFilters(false);
    if (hasChildren && prefs) fetchFresh(filters);
  }

  function handleClearManualLocation() {
    clearManualLocation();
    setShowFilters(false);
    if (hasChildren && prefs) fetchFresh(filters);
  }

  async function handleToggleAll() {
    if (showAll) { setShowAll(false); return; }
    setLoadingAll(true);
    setShowAll(true);
    try {
      const exclude = activities.map(a => a.id).join(',');
      const res = await fetch(`/api/activities/queue/all?exclude=${encodeURIComponent(exclude)}`);
      if (res.ok) setAllActivities((await res.json()).activities ?? []);
    } catch { /* silent */ } finally {
      setLoadingAll(false);
    }
  }

  const hasActivities = activities.length > 0;

  // ── Filter summary chips ───────────────────────────────────────────────────
  const filterLabels = [
    filters.timeAvailable === '1-2h' ? '1–2 hrs' : filters.timeAvailable === 'half-day' ? 'Half day' : 'Full day',
    filters.indoorOutdoor === 'either' ? 'Any' : filters.indoorOutdoor === 'indoor' ? 'Indoor' : 'Outdoor',
    filters.energyLevel === 'low' ? 'Relaxed' : filters.energyLevel === 'medium' ? 'Active' : 'Wild',
    filters.transport === 'car' ? '🚗' : filters.transport === 'public' ? '🚌' : '🚶',
    `£${filters.budgetPerChild}`,
    ...(filters.surpriseMe ? ['✨'] : []),
    isManual ? `📍 ${locationLabel ?? 'Manual'}` : '📍 GPS',
  ];

  return (
    <>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 14px 104px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>
              Adventure Time!
            </h1>
            {prefs?.children && prefs.children.length > 0 && (
              <p style={{ margin: '2px 0 0', color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
                {prefs.children.map(c => c.name).join(' & ')}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {weather && <WeatherBadge weather={weather} />}
            <button
              onClick={() => setShowFilters(true)}
              style={{
                background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
                borderRadius: 4, padding: '7px 11px', cursor: 'pointer',
                fontSize: '0.75rem', fontFamily: 'var(--font-display)', fontWeight: 700,
                color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              ⚙ Filters
            </button>
          </div>
        </div>

        {/* ── Active filter summary — tap to edit ── */}
        {prefsReady && hasChildren && (
          <div
            onClick={() => setShowFilters(true)}
            style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14, cursor: 'pointer' }}
            title="Tap to change filters"
          >
            {filterLabels.map((label, i) => (
              <span
                key={i}
                style={{
                  background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
                  borderRadius: 999, padding: '4px 9px',
                  fontSize: '0.7rem', fontWeight: 700,
                  color: 'var(--color-text-muted)', fontFamily: 'var(--font-display)',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </span>
            ))}
          </div>
        )}

        {/* ── No children setup nudge ── */}
        {prefsReady && !hasChildren && !loading && (
          <div style={{
            background: 'var(--color-brand-light)', border: '1.5px solid var(--color-brand-mid)',
            borderRadius: 10, padding: '14px 16px', marginBottom: 20,
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.92rem', color: 'var(--color-brand)' }}>
              Add your children first
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 3 }}>
              Go to Settings to set up children profiles — suggestions are tailored to them.
            </div>
          </div>
        )}

        {/* ── Loading skeletons ── */}
        {(!prefsReady || loading) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="card skeleton" style={{ height: 200 }} />
            ))}
          </div>
        )}

        {/* ── Results header ── */}
        {!loading && hasActivities && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem' }}>
              Today&apos;s picks
            </span>
            {isStale ? (
              <span style={{ fontSize: '0.7rem', color: 'var(--color-brand)' }}>✦ Updating…</span>
            ) : queueRemaining > 0 ? (
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-faint)' }}>{queueRemaining} more ready</span>
            ) : null}
          </div>
        )}

        {/* ── Activity cards ── */}
        {!loading && hasActivities && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activities.map((activity, i) => (
              <ActivityCardV2
                key={activity.id}
                activity={activity}
                index={i}
                onAccept={handleAccept}
                onSkip={handleSkip}
              />
            ))}
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && prefsReady && hasChildren && activities.length === 0 && (
          <div className="card" style={{ padding: '36px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>🎉</div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', marginBottom: 6 }}>All caught up!</h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: 18 }}>
              You&apos;ve looked through today&apos;s suggestions.
            </p>
            <button className="btn-primary" onClick={handleNextPicks}>Find more picks</button>
          </div>
        )}

        {/* ── Actions + browse more ── */}
        {!loading && hasActivities && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Next picks */}
            <button
              className="btn-secondary"
              style={{ width: '100%' }}
              onClick={handleNextPicks}
            >
              Next 3 picks →
            </button>

            {/* Browse all saved — subtle, expandable */}
            {(queueRemaining > 0 || showAll) && (
              <>
                <button
                  onClick={handleToggleAll}
                  style={{
                    width: '100%', background: 'transparent',
                    border: '1.5px dashed var(--color-border)', borderRadius: 8,
                    padding: '9px 14px', fontSize: '0.78rem',
                    fontFamily: 'var(--font-display)', fontWeight: 700,
                    color: 'var(--color-text-faint)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}
                >
                  {loadingAll
                    ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Loading…</>
                    : showAll
                    ? '↑ Hide saved suggestions'
                    : `↓ Browse all ${queueRemaining} saved suggestions`}
                </button>

                {showAll && !loadingAll && (
                  <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {allActivities.length === 0 ? (
                      <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--color-text-muted)', padding: '14px 0' }}>
                        No other suggestions queued right now.
                      </p>
                    ) : allActivities.map((a, i) => (
                      <ActivityCardV2
                        key={a.id}
                        activity={a}
                        index={i}
                        onAccept={handleAccept}
                        onSkip={handleSkip}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Version toggle — subtle link at bottom ── */}
        <div style={{ marginTop: 36, textAlign: 'center' }}>
          <button
            onClick={onSwitchVersion}
            style={{
              background: 'transparent', border: 'none',
              fontSize: '0.7rem', color: 'var(--color-text-faint)',
              cursor: 'pointer', textDecoration: 'underline',
              textDecorationStyle: 'dotted', padding: '4px 8px',
            }}
          >
            Switch to classic view
          </button>
        </div>
      </div>

      <Navigation />

      {/* Filter sheet */}
      {showFilters && (
        <FilterSheet
          filters={filters}
          isManual={isManual}
          locationLabel={locationLabel}
          onApply={handleFiltersApply}
          onSetManualLocation={handleSetManualLocation}
          onClearManualLocation={handleClearManualLocation}
          onClose={() => setShowFilters(false)}
        />
      )}
    </>
  );
}
