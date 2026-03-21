'use client';

import { useState, useRef } from 'react';
import type { Activity } from '@/types';

interface Props {
  activities: Activity[];
  total: number;
  onAccept: (activity: Activity) => void;
  onSkip: (activity: Activity) => void;
}

const ENERGY_COLOUR: Record<string, string> = {
  low: '#16A34A',
  medium: '#3B82F6',
  high: '#F97316',
};
const ENERGY_BG: Record<string, string> = {
  low: '#BBF7D0',
  medium: '#DBEAFE',
  high: '#FED7AA',
};
const CATEGORY_EMOJI: Record<string, string> = {
  playground_adventure: '🛝',
  museum_mission: '🏛️',
  soft_play: '🧸',
  cheap_cinema: '🎬',
  nature_walk: '🌿',
  at_home_creative: '🎨',
  local_event: '🎡',
};

export default function SwipeCard({ activities, total, onAccept, onSkip }: Props) {
  const [animating, setAnimating] = useState<'left' | 'right' | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const current = activities[0];
  const completed = total - activities.length;

  // Reset photo error when card changes
  const prevId = useRef<string | null>(null);
  if (current && current.id !== prevId.current) {
    prevId.current = current.id;
    if (photoError) setPhotoError(false);
  }

  if (!current) {
    return (
      <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', marginBottom: 8 }}>
          All sorted!
        </h3>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          You&apos;ve reviewed all of today&apos;s suggestions.
        </p>
      </div>
    );
  }

  const hasPhoto = !photoError && !!current.venue?.photoName;
  const photoUrl = current.venue?.photoName
    ? `/api/photo?name=${encodeURIComponent(current.venue.photoName)}`
    : null;
  const costLabel =
    current.costPerChild === 0 ? 'Free' : `£${current.costPerChild.toFixed(0)}/child`;

  function animateAndCall(dir: 'left' | 'right', cb: () => void) {
    setAnimating(dir);
    setTimeout(() => {
      setAnimating(null);
      cb();
    }, 280);
  }

  function handleAccept() {
    animateAndCall('right', () => onAccept(current));
  }

  function handleSkip() {
    animateAndCall('left', () => onSkip(current));
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (delta > 60) handleAccept();
    else if (delta < -60) handleSkip();
  }

  return (
    <div>
      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 6,
              width: i < completed ? 6 : i === completed ? 22 : 6,
              borderRadius: 3,
              background:
                i < completed
                  ? 'var(--color-green)'
                  : i === completed
                  ? 'var(--color-orange)'
                  : 'var(--color-border)',
              transition: 'all 0.3s ease',
            }}
          />
        ))}
      </div>

      {/* Card */}
      <div
        className="card"
        style={{
          overflow: 'hidden',
          transform:
            animating === 'left'
              ? 'translateX(-110%) rotate(-6deg)'
              : animating === 'right'
              ? 'translateX(110%) rotate(6deg)'
              : 'none',
          opacity: animating ? 0 : 1,
          transition: animating ? 'transform 0.28s ease, opacity 0.28s ease' : 'none',
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Photo or emoji header */}
        {hasPhoto && photoUrl ? (
          <div style={{ position: 'relative', height: 240, overflow: 'hidden' }}>
            <img
              src={photoUrl}
              alt={current.venue!.name}
              onError={() => setPhotoError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to bottom, transparent 20%, rgba(0,0,0,0.78) 100%)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                padding: '20px',
              }}
            >
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.4rem',
                  fontWeight: 800,
                  color: '#fff',
                  margin: 0,
                  lineHeight: 1.2,
                  textShadow: '0 1px 6px rgba(0,0,0,0.4)',
                }}
              >
                {current.title}
              </h2>
            </div>
          </div>
        ) : (
          <div
            style={{
              background: 'linear-gradient(135deg, var(--color-orange-light) 0%, #fff7ed 100%)',
              padding: '32px 20px 24px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 56, marginBottom: 12 }}>{current.emoji}</div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.4rem',
                fontWeight: 800,
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              {current.title}
            </h2>
          </div>
        )}

        {/* Content */}
        <div style={{ padding: '16px 18px' }}>
          {/* Badges */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            <span
              style={{
                background: '#BBF7D0',
                color: '#166534',
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '4px 11px',
                borderRadius: 999,
                fontFamily: 'var(--font-display)',
              }}
            >
              {costLabel}
            </span>
            <span
              style={{
                background: ENERGY_BG[current.energyLevel] ?? '#F3F4F6',
                color: ENERGY_COLOUR[current.energyLevel] ?? 'var(--color-text-muted)',
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '4px 11px',
                borderRadius: 999,
                fontFamily: 'var(--font-display)',
              }}
            >
              {CATEGORY_EMOJI[current.category]} {current.duration}
            </span>
            {current.venue?.rating && (
              <span
                style={{
                  background: '#FEF9C3',
                  color: '#854D0E',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '4px 11px',
                  borderRadius: 999,
                  fontFamily: 'var(--font-display)',
                }}
              >
                ⭐ {current.venue.rating.toFixed(1)}
              </span>
            )}
            {current.venue?.openNow === false && (
              <span
                style={{
                  background: '#FEE2E2',
                  color: '#991B1B',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '4px 11px',
                  borderRadius: 999,
                  fontFamily: 'var(--font-display)',
                }}
              >
                May be closed
              </span>
            )}
          </div>

          {/* Venue */}
          {current.venue && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                marginBottom: 16,
                padding: '10px 12px',
                background: 'var(--color-bg)',
                borderRadius: 10,
              }}
            >
              <span style={{ fontSize: 14 }}>📍</span>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.82rem' }}>
                  {current.venue.name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 1 }}>
                  {current.venue.address}
                </div>
              </div>
            </div>
          )}

          {/* The plan */}
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              margin: '0 0 8px',
            }}
          >
            The plan
          </p>
          <ol style={{ margin: '0 0 16px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {current.plan.map((step, i) => (
              <li key={i} style={{ fontSize: '0.85rem', color: 'var(--color-text)', lineHeight: 1.4 }}>
                {step}
              </li>
            ))}
          </ol>

          {/* Why it works */}
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              margin: '0 0 8px',
            }}
          >
            Why it works
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
            {current.whyItWorks.map((w, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--color-bg)',
                  borderRadius: 10,
                  padding: '9px 12px',
                  borderLeft: '3px solid var(--color-orange)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    color: 'var(--color-orange-dark)',
                  }}
                >
                  {w.name}, {w.age}
                </span>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.35 }}>
                  {w.reason}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Swipe hint */}
        <p
          style={{
            textAlign: 'center',
            fontSize: '0.72rem',
            color: 'var(--color-text-faint)',
            margin: '0 0 8px',
          }}
        >
          ← swipe to skip · swipe to accept →
        </p>

        {/* Action buttons */}
        <div style={{ padding: '0 18px 22px', display: 'flex', gap: 10 }}>
          <button
            className="btn-secondary"
            style={{ flex: 1, fontSize: '0.9rem' }}
            onClick={handleSkip}
          >
            Skip ✕
          </button>
          <button
            className="btn-primary"
            style={{ flex: 2 }}
            onClick={handleAccept}
          >
            Let&apos;s go! 🎉
          </button>
        </div>
      </div>
    </div>
  );
}
