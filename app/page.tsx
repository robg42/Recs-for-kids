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
import { saveFilters, loadFilters } from '@/lib/storage';
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

function getInitialFilters(): ActivityFilters {
  const saved = loadFilters();
  return saved ?? DEFAULT_FILTERS;
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

  const resultsModeRef = useRef(resultsMode);
  resultsModeRef.current = resultsMode;

  // Track whether we've already done the initial auto-fetch
  const autoFetchedRef = useRef(false);

  function updateFilter<K extends keyof ActivityFilters>(key: K, value: ActivityFilters[K]) {
    setFilters((f) => {
      const next = { ...f, [key]: value };
      saveFilters(next);
      return next;
    });
  }

  const fetchActivities = useCallback(
    async (currentFilters: ActivityFilters) => {
      if (!hasChildren || !prefs) {
        router.push('/settings');
        return;
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
          ? {
              playground_adventure: 1,
              museum_mission: 1,
              soft_play: 1,
              cheap_cinema: 1,
              nature_walk: 1,
              at_home_creative: 1,
              local_event: 1,
            }
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
        saveFilters(currentFilters);
      } catch {
        setError('Network error. Please check your connection and try again.');
      } finally {
        setLoading(false);
      }
    },
    [hasChildren, prefs, requestLocation, router]
  );

  // Auto-fetch once when prefs first become available and user has children
  useEffect(() => {
    if (!autoFetchedRef.current && hasChildren && prefs) {
      autoFetchedRef.current = true;
      fetchActivities(filters);
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
        fetchActivities(current);
        return current;
      });
    }, 600);
  }

  function handleAccept(activity: Activity) {
    accept(activity);
    setActivities((prev) => prev.filter((a) => a.id !== activity.id));
  }

  function handleRejectClick(activity: Activity) {
    setRejecting(activity);
  }

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

  // Labels for filter display
  const timeLabels: Record<TimeAvailable, string> = { '1-2h': '1–2 hrs', 'half-day': 'Half day', 'full-day': 'Full day' };
  const timeEmojis: Record<TimeAvailable, string> = { '1-2h': '⚡', 'half-day': '☀️', 'full-day': '🌟' };
  const ioLabels: Record<IndoorOutdoor, string> = { indoor: 'Indoor', either: 'Either', outdoor: 'Outdoor' };
  const ioEmojis: Record<IndoorOutdoor, string> = { indoor: '🏠', either: '🌤️', outdoor: '🌳' };
  const energyLabels: Record<EnergyLevel, string> = { low: 'Relaxed', medium: 'Active', high: 'Wild!' };
  const energyEmojis: Record<EnergyLevel, string> = { low: '😌', medium: '😊', high: '🔥' };

  const timeOptions: TimeAvailable[] = ['1-2h', 'half-day', 'full-day'];
  const ioOptions: IndoorOutdoor[] = ['indoor', 'either', 'outdoor'];
  const energyOptions: EnergyLevel[] = ['low', 'medium', 'high'];
  const transportOptions: Transport[] = ['car', 'public'];

  function cycleOption<T>(current: T, options: T[], key: keyof ActivityFilters) {
    const idx = options.indexOf(current);
    const next = options[(idx + 1) % options.length];
    handleFilterChange(key, next as ActivityFilters[typeof key]);
  }

  const pillStyle = (active?: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '5px 10px',
    borderRadius: 999,
    border: `1.5px solid ${active ? 'var(--color-orange)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-orange-light)' : 'var(--color-bg-card)',
    fontSize: '0.78rem',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    color: active ? 'var(--color-orange-dark)' : 'var(--color-text)',
    transition: 'all 0.12s',
    flexShrink: 0,
  });

  // No children — nudge to settings
  const noChildrenBanner = !hasChildren && !loading && (
    <div
      style={{
        background: 'var(--color-orange-light)',
        border: '2px solid var(--color-orange)',
        borderRadius: 'var(--radius-button)',
        padding: '14px 16px',
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span style={{ fontSize: 24 }}>👶</span>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-orange-dark)' }}>
          Add your children first
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--color-orange-dark)', opacity: 0.8 }}>
          Go to Settings to set up children profiles
        </div>
      </div>
    </div>
  );

  return (
    <>
      <main style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px 100px', minHeight: '100dvh' }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--color-text)' }}>
                🗺️ Family Adventures
              </h1>
              <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                {prefs?.children && prefs.children.length > 0
                  ? `For ${prefs.children.map((c) => c.name).join(' & ')}`
                  : 'What should we do today?'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {weather && <WeatherBadge weather={weather} />}
              {hasResults && (
                <div style={{ display: 'flex', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
                  <button
                    onClick={() => setResultsMode('list')}
                    title="List view"
                    style={{ padding: '7px 10px', border: 'none', cursor: 'pointer', background: resultsMode === 'list' ? 'var(--color-orange)' : 'transparent', color: resultsMode === 'list' ? '#fff' : 'var(--color-text-muted)', fontSize: 14, transition: 'all 0.15s', lineHeight: 1 }}
                  >
                    ☰
                  </button>
                  <button
                    onClick={() => setResultsMode('stack')}
                    title="Stack view"
                    style={{ padding: '7px 10px', border: 'none', cursor: 'pointer', background: resultsMode === 'stack' ? 'var(--color-orange)' : 'transparent', color: resultsMode === 'stack' ? '#fff' : 'var(--color-text-muted)', fontSize: 14, transition: 'all 0.15s', lineHeight: 1 }}
                  >
                    ⊞
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* No children state */}
        {!hasChildren && noChildrenBanner}

        {/* Compact filter strip — always visible when we have children */}
        {hasChildren && (
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                paddingBottom: 4,
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              {/* Time */}
              <button style={pillStyle()} onClick={() => cycleOption(filters.timeAvailable, timeOptions, 'timeAvailable')}>
                {timeEmojis[filters.timeAvailable]} {timeLabels[filters.timeAvailable]}
              </button>

              {/* Indoor/outdoor */}
              <button style={pillStyle()} onClick={() => cycleOption(filters.indoorOutdoor, ioOptions, 'indoorOutdoor')}>
                {ioEmojis[filters.indoorOutdoor]} {ioLabels[filters.indoorOutdoor]}
              </button>

              {/* Energy */}
              <button style={pillStyle()} onClick={() => cycleOption(filters.energyLevel, energyOptions, 'energyLevel')}>
                {energyEmojis[filters.energyLevel]} {energyLabels[filters.energyLevel]}
              </button>

              {/* Transport */}
              <button style={pillStyle()} onClick={() => cycleOption(filters.transport, transportOptions, 'transport')}>
                {filters.transport === 'car' ? '🚗' : '🚌'} {filters.transport === 'car' ? 'Car' : 'Bus'}
              </button>

              {/* Budget */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                <button
                  style={pillStyle()}
                  onClick={() => {
                    const v = Math.max(0, filters.budgetPerChild - 5);
                    handleFilterChange('budgetPerChild', v);
                  }}
                >
                  −
                </button>
                <span style={{ ...pillStyle(), cursor: 'default', background: 'var(--color-bg-card)' }}>
                  💰 £{filters.budgetPerChild}
                </span>
                <button
                  style={pillStyle()}
                  onClick={() => {
                    const v = Math.min(30, filters.budgetPerChild + 5);
                    handleFilterChange('budgetPerChild', v);
                  }}
                >
                  +
                </button>
              </div>

              {/* Surprise me toggle */}
              <button
                style={pillStyle(filters.surpriseMe)}
                onClick={() => handleFilterChange('surpriseMe', !filters.surpriseMe)}
              >
                🎲 Surprise
              </button>

              {/* Refresh */}
              {hasResults && (
                <button
                  style={{ ...pillStyle(), background: 'var(--color-orange)', color: '#fff', border: '1.5px solid var(--color-orange)' }}
                  onClick={() => fetchActivities(filters)}
                  disabled={loading}
                >
                  {loading ? '…' : '↻ Refresh'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Full form (expandable) */}
        {showFullForm && hasChildren && (
          <div style={{ marginBottom: 24 }}>
            <InputForm
              onSubmit={(f) => { setShowFullForm(false); fetchActivities(f); }}
              loading={loading}
              initialFilters={filters}
              onFiltersChange={(f) => setFilters(f)}
            />
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="card skeleton" style={{ height: 200, borderRadius: 'var(--radius-card)' }} />
            ))}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <p style={{ color: '#DC2626', fontSize: '0.875rem', marginTop: 16, textAlign: 'center' }}>
            {error}
          </p>
        )}

        {/* Results */}
        {!loading && hasResults && (
          <>
            {/* Results header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
                Today&apos;s picks 🎯
              </h2>
              <button
                className="btn-ghost"
                onClick={() => setShowFullForm((v) => !v)}
                style={{ fontSize: '0.8rem' }}
              >
                {showFullForm ? '✕ Close' : '⚙ More filters'}
              </button>
            </div>

            {activities.length === 0 ? (
              <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: 8 }}>
                  All sorted!
                </h3>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                  You&apos;ve reviewed all today&apos;s suggestions. Tap ↻ Refresh for more ideas.
                </p>
                <button className="btn-primary" style={{ marginTop: 20 }} onClick={() => fetchActivities(filters)}>
                  Find more adventures
                </button>
              </div>
            ) : resultsMode === 'stack' ? (
              <SwipeCard
                activities={activities}
                total={activityTotal}
                onAccept={handleAccept}
                onSkip={handleSkip}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {activities.map((activity, i) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    index={i}
                    onAccept={handleAccept}
                    onReject={handleRejectClick}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* First-time state: no children */}
        {!hasChildren && !loading && (
          <InputForm
            onSubmit={(f) => { saveFilters(f); fetchActivities(f); }}
            loading={loading}
            initialFilters={filters}
            onFiltersChange={(f) => setFilters(f)}
          />
        )}
      </main>

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
