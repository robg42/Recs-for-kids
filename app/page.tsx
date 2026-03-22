'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import DiscoverV2 from '@/components/DiscoverV2';
import Navigation from '@/components/Navigation';
import ActivityCard from '@/components/ActivityCard';
import WeatherBadge from '@/components/WeatherBadge';

// Lazy-load heavy components — deferred until after the critical path renders
const InputForm    = dynamic(() => import('@/components/InputForm'));
const SwipeCard    = dynamic(() => import('@/components/SwipeCard'));
const FeedbackModal = dynamic(() => import('@/components/FeedbackModal'));
import { usePreferences } from '@/hooks/usePreferences';
import { useLocation } from '@/hooks/useLocation';
import { postcodeToCoords } from '@/lib/geocode';
import { saveFilters, loadFilters, saveResultsCache, loadResultsCache } from '@/lib/storage';
import type {
  ActivityFilters,
  Activity,
  RejectionReason,
  WeatherData,
  GenerateActivitiesRequest,
  TimeAvailable,
  IndoorOutdoor,
  EnergyLevel,
  Transport,
} from '@/types';

type ResultsMode = 'list' | 'stack';

const DEFAULT_FILTERS: ActivityFilters = {
  timeAvailable: 'half-day',
  indoorOutdoor: 'either',
  energyLevel: 'medium',
  transport: 'car',
  budgetPerChild: 15,
  surpriseMe: false,
};

// Trigger a background refill when fewer than this many activities are queued
const REFILL_THRESHOLD = 7;

function getInitialFilters(): ActivityFilters {
  return loadFilters() ?? DEFAULT_FILTERS;
}

function minutesAgo(ms: number) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  return `${mins} mins ago`;
}

export default function DiscoverPage() {
  // ── Version switcher ─────────────────────────────────────────────────────
  // Default to V2 (new design). Client reads localStorage after hydration.
  const [uiVersion, setUiVersion] = useState<'v1' | 'v2'>('v2');
  useEffect(() => {
    const stored = localStorage.getItem('rfk-ui-version') as 'v1' | 'v2' | null;
    setUiVersion(stored ?? 'v2');
  }, []);

  if (uiVersion === 'v2') {
    return (
      <DiscoverV2
        onSwitchVersion={() => {
          localStorage.setItem('rfk-ui-version', 'v1');
          setUiVersion('v1');
        }}
      />
    );
  }

  // ── Classic (V1) ─────────────────────────────────────────────────────────
  return <DiscoverV1 onSwitchToNew={() => { localStorage.setItem('rfk-ui-version', 'v2'); setUiVersion('v2'); }} />;
}

function DiscoverV1({ onSwitchToNew }: { onSwitchToNew: () => void }) {
  const router = useRouter();
  const { prefs, accept, reject, hasChildren, initialized: prefsReady } = usePreferences();

  // Always-current refs so async functions (init, triggerBackgroundFill) can read the
  // latest values without stale closure captures from mount time.
  const hasChildrenRef      = useRef(hasChildren);
  const prefsRef            = useRef(prefs);
  hasChildrenRef.current    = hasChildren;
  prefsRef.current          = prefs;
  const { requestLocation, setManualLocation, clearManualLocation, isManual, label: locationLabel } = useLocation();
  // Keep a stable ref to requestLocation so init() can fire the GPS warm-up
  // without capturing a stale closure value from mount time.
  const requestLocationRef  = useRef(requestLocation);
  requestLocationRef.current = requestLocation;

  const [filters, setFilters] = useState<ActivityFilters>(getInitialFilters);
  const [resultsMode, setResultsMode] = useState<ResultsMode>('list');
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Activity | null>(null);
  const [hasResults, setHasResults] = useState(false);
  const [showFullForm, setShowFullForm] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [queueRemaining, setQueueRemaining] = useState(0);
  const [isStaleResults, setIsStaleResults] = useState(false);

  // "See all" queue preview state
  const [showAll, setShowAll] = useState(false);
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);

  // Location override UI state
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [postcodeInput, setPostcodeInput] = useState('');
  const [postcodeLoading, setPostcodeLoading] = useState(false);
  const [postcodeError, setPostcodeError] = useState<string | null>(null);

  // Pull-to-refresh state
  const [pullY, setPullY] = useState(0);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const mainRef = useRef<HTMLDivElement>(null);

  const autoFetchedRef = useRef(false);
  const fillingRef = useRef(false); // prevent duplicate background fills

  // ─── Background queue fill ──────────────────────────────────────────────
  const triggerBackgroundFill = useCallback(async () => {
    if (fillingRef.current || !prefs || !hasChildren) return;
    fillingRef.current = true;

    let coords: { lat: number; lon: number };
    try {
      coords = await requestLocation();
    } catch {
      fillingRef.current = false;
      return; // silently skip — background operation
    }

    const body: GenerateActivitiesRequest = {
      filters,
      children: prefs.children,
      coords,
      recentActivityIds: prefs.recentActivityIds,
      categoryWeights: filters.surpriseMe
        ? { playground_adventure: 1, museum_mission: 1, soft_play: 1, cheap_cinema: 1, nature_walk: 1, at_home_creative: 1, local_event: 1 }
        : prefs.categoryWeights,
    };

    try {
      await fetch('/api/activities/queue/fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      // Non-fatal — just silently fail
    } finally {
      fillingRef.current = false;
    }
  }, [prefs, hasChildren, requestLocation, filters]);

  // ─── Pop from queue (instant serve) ─────────────────────────────────────
  const popFromQueue = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/activities/queue');
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.activities || data.activities.length === 0) return false;

      setActivities(data.activities);
      setActivityTotal(data.activities.length);
      if (data.weather) setWeather(data.weather);
      setHasResults(true);
      setIsFromCache(false);
      setCachedAt(null);
      setQueueRemaining(data.eligibleRemaining ?? 0);
      setIsStaleResults(data.isStale === true);
      saveResultsCache(data.activities, data.weather ?? weather, filters);

      // Stale results or low queue → kick off a background fill immediately
      if (data.isStale || (data.eligibleRemaining ?? 0) < REFILL_THRESHOLD) {
        triggerBackgroundFill();
      }
      return true;
    } catch {
      return false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, weather, triggerBackgroundFill]);

  // ─── Standard fresh generation (fallback / filter-change) ───────────────
  const fetchActivities = useCallback(
    async (currentFilters: ActivityFilters, isPullRefresh = false) => {
      if (!hasChildren || !prefs) {
        router.push('/settings');
        return;
      }

      // Pull-to-refresh: try queue first — instant if pre-populated
      if (isPullRefresh) {
        setLoading(true);
        setError(null);
        const gotFromQueue = await popFromQueue();
        setLoading(false);
        if (gotFromQueue) return;
        // Queue empty — fall through to fresh generation below
      }

      setLoading(true);
      setError(null);

      let coords: { lat: number; lon: number };
      try {
        coords = await requestLocation();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not get your location');
        setLoading(false);
        return;
      }

      const body: GenerateActivitiesRequest = {
        filters: currentFilters,
        children: prefs.children,
        coords,
        recentActivityIds: prefs.recentActivityIds,
        categoryWeights: currentFilters.surpriseMe
          ? { playground_adventure: 1, museum_mission: 1, soft_play: 1, cheap_cinema: 1, nature_walk: 1, at_home_creative: 1, local_event: 1 }
          : prefs.categoryWeights,
      };

      try {
        const res = await fetch('/api/activities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await res.json();

        if (!res.ok || data.error) {
          setError(data.error ?? 'Something went wrong');
          setLoading(false);
          return;
        }

        const fetched: Activity[] = data.activities ?? [];
        setActivities(fetched);
        setActivityTotal(fetched.length);
        setWeather(data.weather ?? null);
        setHasResults(true);
        setIsFromCache(false);
        setCachedAt(null);
        saveFilters(currentFilters);
        if (fetched.length > 0) saveResultsCache(fetched, data.weather, currentFilters);

        // Immediately kick off background fill so the queue is ready for next pull
        triggerBackgroundFill();
      } catch {
        setError('Network error. Please check your connection and try again.');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasChildren, prefs, requestLocation, router, popFromQueue, triggerBackgroundFill]
  );

  // ─── On mount: fire cache + queue requests in parallel ───────────────────
  //
  // Key design decisions:
  //  1. Both /api/activities/cached and /api/activities/queue start at the
  //     same time — no sequential waiting.
  //  2. autoFetchedRef is set to true synchronously (before any await) so the
  //     separate auto-fetch effect below can never race ahead and fire a
  //     redundant full Claude generation while we're still waiting for queue.
  //  3. Queue results replace cached results if present.
  //  4. Only fall through to a fresh Claude generation if the queue was empty
  //     AND the local cache is stale (>10 min).
  const FRESH_THRESHOLD_MS = 10 * 60 * 1000;

  useEffect(() => {
    async function init() {
      // Block the auto-fetch effect immediately (synchronous, before any await)
      autoFetchedRef.current = true;

      // 1. Fire cache, queue, and GPS warm-up all in parallel so the location
      //    permission prompt and positioning start immediately — by the time we
      //    need coords they are usually already resolved.
      requestLocationRef.current().catch(() => {}); // warm-up: errors are fine here

      const cachedPromise = fetch('/api/activities/cached')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      const queuePromise = fetch('/api/activities/queue')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      // 2. Show cached results as soon as they arrive (fast visual feedback)
      const cached = await cachedPromise;
      if (cached?.found && Array.isArray(cached.activities) && cached.activities.length > 0) {
        setActivities(cached.activities);
        setActivityTotal(cached.activities.length);
        setWeather(cached.weather ?? null);
        setHasResults(true);
        setCachedAt(cached.cachedAt ?? Date.now());
        setIsFromCache(true);
      } else {
        // localStorage fallback while queue responds
        const lsCache = loadResultsCache();
        if (lsCache && lsCache.activities.length > 0) {
          setActivities(lsCache.activities);
          setActivityTotal(lsCache.activities.length);
          setWeather(lsCache.weather);
          setHasResults(true);
          setCachedAt(lsCache.savedAt);
          setIsFromCache(true);
        }
      }

      // 3. Queue results override cached — instant if queue is populated
      const queueData = await queuePromise;
      if (queueData?.activities?.length > 0) {
        setActivities(queueData.activities);
        setActivityTotal(queueData.activities.length);
        if (queueData.weather) setWeather(queueData.weather);
        setHasResults(true);
        setIsFromCache(false);
        setCachedAt(null);
        setQueueRemaining(queueData.eligibleRemaining ?? 0);
        setIsStaleResults(queueData.isStale === true);
        saveResultsCache(queueData.activities, queueData.weather ?? null, filters);
        // Stale results or low queue → trigger fill so fresh content arrives shortly
        if (queueData.isStale || (queueData.eligibleRemaining ?? 0) < REFILL_THRESHOLD) {
          triggerBackgroundFill();
        }
        return; // done — skip fresh generation
      }

      // 4. Queue was empty — fall back to fresh generation only if cache is stale.
      //    Use refs here: by the time this await resolves, usePreferences has
      //    already run its effect and updated hasChildrenRef / prefsRef.
      const lsCache = loadResultsCache();
      const isFresh =
        lsCache &&
        lsCache.activities.length > 0 &&
        Date.now() - lsCache.savedAt < FRESH_THRESHOLD_MS;
      if (!isFresh && hasChildrenRef.current && prefsRef.current) {
        fetchActivities(filters);
      }
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Auto-fetch once when prefs become available ─────────────────────────
  // This fires if init() already set autoFetchedRef=true, it's a no-op.
  // It acts as a fallback for the edge case where prefs weren't available
  // on mount (e.g. first-ever visit with no localStorage data).
  useEffect(() => {
    if (!autoFetchedRef.current && hasChildren && prefs) {
      autoFetchedRef.current = true;
      const cache = loadResultsCache();
      const isFresh =
        cache && cache.activities.length > 0 && Date.now() - cache.savedAt < FRESH_THRESHOLD_MS;
      if (!isFresh) {
        fetchActivities(filters);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasChildren, prefs]);

  function updateFilter<K extends keyof ActivityFilters>(key: K, value: ActivityFilters[K]) {
    setFilters((f) => {
      const next = { ...f, [key]: value };
      saveFilters(next);
      return next;
    });
  }

  // Debounce re-fetch when filters change (after initial load)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleFilterChange<K extends keyof ActivityFilters>(key: K, value: ActivityFilters[K]) {
    updateFilter(key, value);
    if (!hasResults) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((current) => {
        fetchActivities(current, false);
        return current;
      });
    }, 700);
  }

  // ─── Postcode location override ──────────────────────────────────────────
  async function handlePostcodeSubmit() {
    if (!postcodeInput.trim()) return;
    setPostcodeLoading(true);
    setPostcodeError(null);
    try {
      const { lat, lon, label } = await postcodeToCoords(postcodeInput.trim());
      setManualLocation(lat, lon, label);
      setShowLocationInput(false);
      setPostcodeInput('');
      // Re-fetch with the new location
      if (hasChildren && prefs) {
        fetchActivities(filters, false);
      }
    } catch (err) {
      setPostcodeError(err instanceof Error ? err.message : 'Could not find postcode');
    } finally {
      setPostcodeLoading(false);
    }
  }

  function handleClearManualLocation() {
    clearManualLocation();
    setShowLocationInput(false);
    if (hasChildren && prefs) {
      fetchActivities(filters, false);
    }
  }

  // ─── Pull-to-refresh ─────────────────────────────────────────────────────
  function handleTouchStart(e: React.TouchEvent) {
    const scrollTop = mainRef.current?.scrollTop ?? 0;
    if (scrollTop > 0) return;
    touchStartY.current = e.touches[0].clientY;
    isPulling.current = true;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isPulling.current) return;
    const scrollTop = mainRef.current?.scrollTop ?? 0;
    if (scrollTop > 0) { isPulling.current = false; setPullY(0); return; }
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) setPullY(Math.min(delta * 0.4, 70));
  }

  function handleTouchEnd() {
    if (!isPulling.current) return;
    isPulling.current = false;
    if (pullY >= 50 && !loading) {
      setPullY(0);
      fetchActivities(filters, true); // true = isPullRefresh → tries queue first
    } else {
      setPullY(0);
    }
  }

  function handleAccept(activity: Activity) {
    accept(activity);
    setActivities((prev) => {
      const next = prev.filter((a) => a.id !== activity.id);
      // If only a few left, refill queue in background
      if (next.length < 3 && queueRemaining < REFILL_THRESHOLD) triggerBackgroundFill();
      return next;
    });
  }

  function handleRejectClick(activity: Activity) { setRejecting(activity); }

  function handleRejectConfirm(reason: RejectionReason) {
    if (!rejecting) return;
    reject(rejecting, reason);
    setActivities((prev) => {
      const next = prev.filter((a) => a.id !== rejecting.id);
      if (next.length < 3 && queueRemaining < REFILL_THRESHOLD) triggerBackgroundFill();
      return next;
    });
    setRejecting(null);
  }

  function handleSkip(activity: Activity) {
    reject(activity, 'not_today');
    setActivities((prev) => {
      const next = prev.filter((a) => a.id !== activity.id);
      if (next.length < 3 && queueRemaining < REFILL_THRESHOLD) triggerBackgroundFill();
      return next;
    });
  }

  async function handleToggleAll() {
    if (showAll) { setShowAll(false); return; }
    setLoadingAll(true);
    setShowAll(true);
    try {
      const excludeParam = activities.map((a) => a.id).join(',');
      const res = await fetch(`/api/activities/queue/all?exclude=${encodeURIComponent(excludeParam)}`);
      if (res.ok) {
        const data = await res.json();
        setAllActivities(data.activities ?? []);
      }
    } catch { /* silent */ } finally {
      setLoadingAll(false);
    }
  }

  // Filter labels (text-only, no emoji)
  const timeLabels: Record<TimeAvailable, string> = { '1-2h': '1–2 hrs', 'half-day': 'Half day', 'full-day': 'Full day' };
  const ioLabels: Record<IndoorOutdoor, string> = { indoor: 'Indoor', either: 'Either', outdoor: 'Outdoor' };
  const energyLabels: Record<EnergyLevel, string> = { low: 'Relaxed', medium: 'Active', high: 'Wild' };
  const transportLabels: Record<Transport, string> = { car: 'Car', public: 'Bus', walking: 'Walking' };

  const timeOptions: TimeAvailable[] = ['1-2h', 'half-day', 'full-day'];
  const ioOptions: IndoorOutdoor[] = ['indoor', 'either', 'outdoor'];
  const energyOptions: EnergyLevel[] = ['low', 'medium', 'high'];
  const transportOptions: Transport[] = ['car', 'public', 'walking'];

  function cycleOption<T>(current: T, options: T[], key: keyof ActivityFilters) {
    const next = options[(options.indexOf(current) + 1) % options.length];
    handleFilterChange(key, next as ActivityFilters[typeof key]);
  }

  const pill = (active?: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '5px 11px',
    borderRadius: 999,
    border: `1.5px solid ${active ? 'var(--color-brand)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-brand-light)' : 'var(--color-bg-card)',
    fontSize: '0.78rem',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    color: active ? 'var(--color-brand-dark)' : 'var(--color-text-muted)',
    transition: 'all 0.12s',
    flexShrink: 0,
    fontFamily: 'var(--font-display)',
  });

  return (
    <>
      <div
        ref={mainRef}
        style={{
          maxWidth: 480,
          margin: '0 auto',
          padding: '20px 16px 100px',
          minHeight: '100dvh',
          overflowY: 'auto',
          position: 'relative',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull-to-refresh indicator */}
        {pullY > 0 && (
          <div
            style={{
              position: 'fixed',
              top: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 100,
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 999,
              padding: '8px 16px',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: pullY >= 50 ? 'var(--color-brand)' : 'var(--color-text-muted)',
              boxShadow: 'var(--shadow-card)',
              transition: 'color 0.15s',
            }}
          >
            {pullY >= 50 ? 'Release for next picks' : 'Pull for next picks'}
          </div>
        )}

        {/* ── New design prompt ── */}
        <button
          onClick={onSwitchToNew}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', background: 'var(--color-brand)', color: '#fff',
            border: 'none', borderRadius: 6, padding: '9px 14px', marginBottom: 14,
            cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.78rem',
            letterSpacing: '0.02em',
          }}
        >
          <span>✦ New design available</span>
          <span style={{ opacity: 0.8, textDecoration: 'underline' }}>Try it →</span>
        </button>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>
              Adventure Time!
            </h1>
            {prefs?.children && prefs.children.length > 0 && (
              <p style={{ margin: '2px 0 0', color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
                {prefs.children.map((c) => c.name).join(' & ')}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {weather && <WeatherBadge weather={weather} />}
            {hasResults && (
              <div style={{ display: 'flex', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
                <button
                  onClick={() => setResultsMode('list')}
                  style={{ padding: '7px 10px', border: 'none', cursor: 'pointer', background: resultsMode === 'list' ? 'var(--color-brand-light)' : 'transparent', color: resultsMode === 'list' ? 'var(--color-brand)' : 'var(--color-text-faint)', fontSize: 13, transition: 'all 0.15s', lineHeight: 1 }}
                >☰</button>
                <button
                  onClick={() => setResultsMode('stack')}
                  style={{ padding: '7px 10px', border: 'none', cursor: 'pointer', background: resultsMode === 'stack' ? 'var(--color-brand-light)' : 'transparent', color: resultsMode === 'stack' ? 'var(--color-brand)' : 'var(--color-text-faint)', fontSize: 13, transition: 'all 0.15s', lineHeight: 1 }}
                >⊞</button>
              </div>
            )}
          </div>
        </div>

        {/* No children nudge — only show once prefs are loaded so we never flash
            this to a user who already has children set up */}
        {prefsReady && !hasChildren && !loading && (
          <div style={{ background: 'var(--color-brand-light)', border: '1.5px solid var(--color-brand-mid)', borderRadius: 14, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-brand-dark)' }}>Add your children first</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-brand-dark)', opacity: 0.7 }}>Go to Settings to set up children profiles</div>
            </div>
          </div>
        )}

        {/* Compact filter strip */}
        {prefsReady && hasChildren && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <button style={pill()} onClick={() => cycleOption(filters.timeAvailable, timeOptions, 'timeAvailable')}>
                {timeLabels[filters.timeAvailable]}
              </button>
              <button style={pill()} onClick={() => cycleOption(filters.indoorOutdoor, ioOptions, 'indoorOutdoor')}>
                {ioLabels[filters.indoorOutdoor]}
              </button>
              <button style={pill()} onClick={() => cycleOption(filters.energyLevel, energyOptions, 'energyLevel')}>
                {energyLabels[filters.energyLevel]}
              </button>
              <button style={pill()} onClick={() => cycleOption(filters.transport, transportOptions, 'transport')}>
                {transportLabels[filters.transport]}
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                <button style={pill()} onClick={() => { const v = Math.max(0, filters.budgetPerChild - 5); handleFilterChange('budgetPerChild', v); }}>−</button>
                <span style={{ ...pill(), cursor: 'default' }}>£{filters.budgetPerChild}</span>
                <button style={pill()} onClick={() => { const v = Math.min(30, filters.budgetPerChild + 5); handleFilterChange('budgetPerChild', v); }}>+</button>
              </div>
              <button style={pill(filters.surpriseMe)} onClick={() => handleFilterChange('surpriseMe', !filters.surpriseMe)}>
                Surprise
              </button>
              {/* Location chip */}
              <button
                style={pill(isManual)}
                onClick={() => setShowLocationInput((v) => !v)}
                title={isManual ? `Using ${locationLabel ?? 'manual location'} — tap to change` : 'Tap to set a specific postcode'}
              >
                📍 {isManual ? (locationLabel ?? 'Manual') : 'GPS'}
              </button>
              {hasResults && (
                <button
                  style={{ ...pill(), background: 'var(--color-brand)', color: '#fff', border: '1.5px solid var(--color-brand)' }}
                  onClick={() => fetchActivities(filters, true)}
                  disabled={loading}
                >
                  {loading ? '…' : 'Refresh'}
                </button>
              )}
            </div>

            {/* Location override panel */}
            {showLocationInput && (
              <div style={{
                marginTop: 10,
                padding: '12px 14px',
                background: 'var(--color-bg-card)',
                border: '1.5px solid var(--color-border)',
                borderRadius: 12,
              }}>
                <p style={{ margin: '0 0 8px', fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                  {isManual ? `Using postcode ${locationLabel} — enter a new one or switch back to GPS` : 'Enter a UK postcode to search a specific area'}
                </p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    value={postcodeInput}
                    onChange={(e) => setPostcodeInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handlePostcodeSubmit()}
                    placeholder="e.g. SE1 3PQ"
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      borderRadius: 8,
                      border: '1.5px solid var(--color-border)',
                      fontSize: '0.9rem',
                      fontFamily: 'var(--font-display)',
                      background: 'var(--color-bg)',
                      color: 'var(--color-text)',
                      letterSpacing: '0.05em',
                    }}
                  />
                  <button
                    onClick={handlePostcodeSubmit}
                    disabled={postcodeLoading || !postcodeInput.trim()}
                    style={{ ...pill(true), flexShrink: 0 }}
                  >
                    {postcodeLoading ? '…' : 'Set'}
                  </button>
                  {isManual && (
                    <button onClick={handleClearManualLocation} style={{ ...pill(), flexShrink: 0 }}>
                      Use GPS
                    </button>
                  )}
                </div>
                {postcodeError && (
                  <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: 'var(--color-rose)', fontWeight: 600 }}>
                    {postcodeError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Full form (expandable) */}
        {showFullForm && prefsReady && hasChildren && (
          <div style={{ marginBottom: 20 }}>
            <InputForm
              onSubmit={(f) => { setShowFullForm(false); fetchActivities(f, false); }}
              loading={loading}
              initialFilters={filters}
              onFiltersChange={(f) => setFilters(f)}
            />
          </div>
        )}

        {/* Loading skeletons — shown while prefs haven't loaded yet (prevents flash
            of old UI) OR while an API fetch is in progress */}
        {(!prefsReady || loading) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="card skeleton" style={{ height: 180 }} />
            ))}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{ background: 'var(--color-rose-light)', border: '1.5px solid #FECDD3', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
            <p style={{ color: 'var(--color-rose)', fontSize: '0.875rem', margin: 0, fontWeight: 600 }}>{error}</p>
          </div>
        )}

        {/* Results */}
        {!loading && hasResults && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem' }}>Today&apos;s picks</span>
                {isFromCache && cachedAt && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-faint)', marginLeft: 8 }}>
                    From {minutesAgo(cachedAt)} · pull down for more
                  </span>
                )}
                {!isFromCache && isStaleResults && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-brand)', marginLeft: 8 }}>
                    ✦ Updating picks…
                  </span>
                )}
                {!isFromCache && !isStaleResults && queueRemaining > 0 && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-faint)', marginLeft: 8 }}>
                    {queueRemaining} more ready
                  </span>
                )}
              </div>
              <button className="btn-ghost" onClick={() => setShowFullForm((v) => !v)} style={{ fontSize: '0.78rem' }}>
                {showFullForm ? 'Close' : 'More filters'}
              </button>
            </div>

            {activities.length === 0 ? (
              <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: 8 }}>All done!</h3>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                  You&apos;ve reviewed today&apos;s suggestions. Pull down or tap Refresh for more.
                </p>
                <button className="btn-primary" style={{ marginTop: 20 }} onClick={() => fetchActivities(filters, true)}>
                  Find more
                </button>
              </div>
            ) : resultsMode === 'stack' ? (
              <SwipeCard activities={activities} total={activityTotal} onAccept={handleAccept} onSkip={handleSkip} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {activities.map((activity, i) => (
                  <ActivityCard key={activity.id} activity={activity} index={i} onAccept={handleAccept} onReject={handleRejectClick} />
                ))}
              </div>
            )}

            {/* See all saved suggestions — discoverable but non-distracting */}
            {resultsMode === 'list' && activities.length > 0 && (queueRemaining > 0 || showAll) && (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={handleToggleAll}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: '1.5px dashed var(--color-border)',
                    borderRadius: 12,
                    padding: '11px 16px',
                    fontSize: '0.82rem',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    transition: 'border-color 0.15s, color 0.15s',
                  }}
                >
                  {loadingAll ? (
                    <><span className="spinner" style={{ width: 14, height: 14 }} /> Loading…</>
                  ) : showAll ? (
                    '↑ Hide saved suggestions'
                  ) : (
                    `↓ Browse all ${queueRemaining} saved suggestions`
                  )}
                </button>

                {showAll && !loadingAll && (
                  <div className="animate-fade-in" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {allActivities.length === 0 ? (
                      <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--color-text-muted)', padding: '16px 0' }}>
                        No other suggestions in the queue right now.
                      </p>
                    ) : (
                      allActivities.map((activity, i) => (
                        <ActivityCard
                          key={activity.id}
                          activity={activity}
                          index={i}
                          onAccept={(a) => { handleAccept(a); setAllActivities((prev) => prev.filter((x) => x.id !== a.id)); }}
                          onReject={(a) => { handleRejectClick(a); setAllActivities((prev) => prev.filter((x) => x.id !== a.id)); }}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* First-time: no children — gated on prefsReady so we never render this
            for a returning user before their localStorage prefs have been read */}
        {prefsReady && !hasChildren && !loading && (
          <InputForm
            onSubmit={(f) => { saveFilters(f); fetchActivities(f); }}
            loading={loading}
            initialFilters={filters}
            onFiltersChange={(f) => setFilters(f)}
          />
        )}
      </div>

      <Navigation />

      {rejecting && (
        <FeedbackModal
          activity={rejecting}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejecting(null)}
        />
      )}
    </>
  );
}
