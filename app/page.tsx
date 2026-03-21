'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import InputForm from '@/components/InputForm';
import ActivityCard from '@/components/ActivityCard';
import SwipeCard from '@/components/SwipeCard';
import FeedbackModal from '@/components/FeedbackModal';
import WeatherBadge from '@/components/WeatherBadge';
import { usePreferences } from '@/hooks/usePreferences';
import { useLocation } from '@/hooks/useLocation';
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

// Rate limit: max N refreshes within window
const REFRESH_MAX = 3;
const REFRESH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

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
  const router = useRouter();
  const { prefs, accept, reject, hasChildren } = usePreferences();
  const { requestLocation } = useLocation();

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
  const [cachedAt, setCachedAt] = useState<number | null>(null); // timestamp of last cache load
  const [isFromCache, setIsFromCache] = useState(false);

  // Pull-to-refresh state
  const [pullY, setPullY] = useState(0);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const mainRef = useRef<HTMLDivElement>(null);

  // Refresh rate limiting
  const refreshTimestampsRef = useRef<number[]>([]);

  function canRefresh(): { ok: boolean; waitSecs?: number } {
    const now = Date.now();
    // Prune old timestamps
    refreshTimestampsRef.current = refreshTimestampsRef.current.filter(t => now - t < REFRESH_WINDOW_MS);
    if (refreshTimestampsRef.current.length >= REFRESH_MAX) {
      const oldest = refreshTimestampsRef.current[0];
      const waitMs = REFRESH_WINDOW_MS - (now - oldest);
      return { ok: false, waitSecs: Math.ceil(waitMs / 1000) };
    }
    return { ok: true };
  }

  function recordRefresh() {
    refreshTimestampsRef.current.push(Date.now());
  }

  const autoFetchedRef = useRef(false);

  // Load cached results instantly on mount — check server cache first, fallback to localStorage
  useEffect(() => {
    async function loadCache() {
      // Try server cache first (persists across devices/browsers)
      try {
        const res = await fetch('/api/activities/cached');
        if (res.ok) {
          const data = await res.json();
          if (data.found && Array.isArray(data.activities) && data.activities.length > 0) {
            setActivities(data.activities);
            setActivityTotal(data.activities.length);
            setWeather(data.weather ?? null);
            setHasResults(true);
            setCachedAt(data.cachedAt ?? Date.now());
            setIsFromCache(true);
            return;
          }
        }
      } catch {
        // Fall through to localStorage
      }
      // Fallback: localStorage cache
      const cache = loadResultsCache();
      if (cache && cache.activities.length > 0) {
        setActivities(cache.activities);
        setActivityTotal(cache.activities.length);
        setWeather(cache.weather);
        setHasResults(true);
        setCachedAt(cache.savedAt);
        setIsFromCache(true);
      }
    }
    loadCache();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateFilter<K extends keyof ActivityFilters>(key: K, value: ActivityFilters[K]) {
    setFilters((f) => {
      const next = { ...f, [key]: value };
      saveFilters(next);
      return next;
    });
  }

  const fetchActivities = useCallback(
    async (currentFilters: ActivityFilters, isManualRefresh = false) => {
      if (!hasChildren || !prefs) {
        router.push('/settings');
        return;
      }

      if (isManualRefresh) {
        const check = canRefresh();
        if (!check.ok) {
          const mins = Math.ceil((check.waitSecs ?? 60) / 60);
          setError(`Too many refreshes. Try again in ${mins} min.`);
          return;
        }
        recordRefresh();
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
      } catch {
        setError('Network error. Please check your connection and try again.');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasChildren, prefs, requestLocation, router]
  );

  // Auto-fetch once when prefs first become available — skip if valid cache exists
  useEffect(() => {
    if (!autoFetchedRef.current && hasChildren && prefs) {
      autoFetchedRef.current = true;
      const cache = loadResultsCache();
      if (!cache || cache.activities.length === 0) {
        fetchActivities(filters);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasChildren, prefs]);

  // Debounce re-fetch when filters change (after initial load)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleFilterChange<K extends keyof ActivityFilters>(key: K, value: ActivityFilters[K]) {
    updateFilter(key, value);
    if (!hasResults) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((current) => {
        fetchActivities(current, true);
        return current;
      });
    }, 700);
  }

  // Pull-to-refresh handlers
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
      fetchActivities(filters, true);
    } else {
      setPullY(0);
    }
  }

  function handleAccept(activity: Activity) {
    accept(activity);
    setActivities((prev) => prev.filter((a) => a.id !== activity.id));
  }

  function handleRejectClick(activity: Activity) { setRejecting(activity); }

  function handleRejectConfirm(reason: RejectionReason) {
    if (!rejecting) return;
    reject(rejecting, reason);
    setActivities((prev) => prev.filter((a) => a.id !== rejecting.id));
    setRejecting(null);
  }

  function handleSkip(activity: Activity) {
    reject(activity, 'not_today');
    setActivities((prev) => prev.filter((a) => a.id !== activity.id));
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
            {pullY >= 50 ? 'Release to refresh' : 'Pull to refresh'}
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>
              Family Adventures
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

        {/* No children nudge */}
        {!hasChildren && !loading && (
          <div style={{ background: 'var(--color-brand-light)', border: '1.5px solid var(--color-brand-mid)', borderRadius: 14, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-brand-dark)' }}>Add your children first</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-brand-dark)', opacity: 0.7 }}>Go to Settings to set up children profiles</div>
            </div>
          </div>
        )}

        {/* Compact filter strip */}
        {hasChildren && (
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
          </div>
        )}

        {/* Full form (expandable) */}
        {showFullForm && hasChildren && (
          <div style={{ marginBottom: 20 }}>
            <InputForm
              onSubmit={(f) => { setShowFullForm(false); fetchActivities(f, true); }}
              loading={loading}
              initialFilters={filters}
              onFiltersChange={(f) => setFilters(f)}
            />
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
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
                    From {minutesAgo(cachedAt)} · pull down to refresh
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
          </>
        )}

        {/* First-time: no children */}
        {!hasChildren && !loading && (
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
