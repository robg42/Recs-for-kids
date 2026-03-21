'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import InputForm from '@/components/InputForm';
import ActivityCard from '@/components/ActivityCard';
import FeedbackModal from '@/components/FeedbackModal';
import WeatherBadge from '@/components/WeatherBadge';
import { usePreferences } from '@/hooks/usePreferences';
import { useLocation } from '@/hooks/useLocation';
import type {
  ActivityFilters,
  Activity,
  RejectionReason,
  WeatherData,
  GenerateActivitiesRequest,
} from '@/types';

type View = 'form' | 'results';

export default function DiscoverPage() {
  const router = useRouter();
  const { prefs, accept, reject, hasChildren } = usePreferences();
  const { requestLocation } = useLocation();

  const [view, setView] = useState<View>('form');
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Activity | null>(null);

  const handleSearch = useCallback(
    async (filters: ActivityFilters) => {
      if (!hasChildren) {
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
        filters,
        children: prefs!.children,
        coords,
        recentActivityIds: prefs!.recentActivityIds,
        categoryWeights: filters.surpriseMe
          ? {
              playground_adventure: 1,
              museum_mission: 1,
              soft_play: 1,
              cheap_cinema: 1,
              nature_walk: 1,
              at_home_creative: 1,
              local_event: 1,
            }
          : prefs!.categoryWeights,
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

        setActivities(data.activities ?? []);
        setWeather(data.weather ?? null);
        setView('results');
      } catch {
        setError('Network error. Please check your connection and try again.');
      } finally {
        setLoading(false);
      }
    },
    [hasChildren, prefs, requestLocation, router]
  );

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
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '0.9rem',
            color: 'var(--color-orange-dark)',
          }}
        >
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
      <main
        style={{
          maxWidth: 480,
          margin: '0 auto',
          padding: '24px 16px 100px',
          minHeight: '100dvh',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.75rem',
                  fontWeight: 800,
                  margin: 0,
                  color: 'var(--color-text)',
                }}
              >
                🗺️ Family Adventures
              </h1>
              <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                {prefs?.children && prefs.children.length > 0
                  ? `For ${prefs.children.map((c) => c.name).join(' & ')}`
                  : "What should we do today?"}
              </p>
            </div>
            {weather && <WeatherBadge weather={weather} />}
          </div>
        </div>

        {view === 'form' ? (
          <>
            {noChildrenBanner}
            <InputForm onSubmit={handleSearch} loading={loading} />
            {error && (
              <p
                style={{
                  color: '#DC2626',
                  fontSize: '0.875rem',
                  marginTop: 16,
                  textAlign: 'center',
                }}
              >
                {error}
              </p>
            )}
          </>
        ) : (
          <>
            {/* Results header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
              }}
            >
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.2rem',
                  fontWeight: 800,
                  margin: 0,
                }}
              >
                Today&apos;s picks 🎯
              </h2>
              <button
                className="btn-ghost"
                onClick={() => setView('form')}
                style={{ fontSize: '0.8rem' }}
              >
                ← Change filters
              </button>
            </div>

            {activities.length === 0 ? (
              <div
                className="card"
                style={{ padding: '40px 24px', textAlign: 'center' }}
              >
                <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.1rem',
                    marginBottom: 8,
                  }}
                >
                  All sorted!
                </h3>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                  You&apos;ve reviewed all today&apos;s suggestions. Check History to see what you picked,
                  or search again for more ideas.
                </p>
                <button
                  className="btn-primary"
                  style={{ marginTop: 20 }}
                  onClick={() => setView('form')}
                >
                  Find more adventures
                </button>
              </div>
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

                <button
                  className="btn-secondary"
                  style={{ marginTop: 8 }}
                  onClick={() => setView('form')}
                >
                  🔄 Search again
                </button>
              </div>
            )}

            {error && (
              <p style={{ color: '#DC2626', fontSize: '0.875rem', marginTop: 16, textAlign: 'center' }}>
                {error}
              </p>
            )}
          </>
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
