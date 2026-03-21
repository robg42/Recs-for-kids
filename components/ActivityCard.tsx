'use client';

import { useState } from 'react';
import type { Activity } from '@/types';

interface Props {
  activity: Activity;
  onAccept: (activity: Activity) => void;
  onReject: (activity: Activity) => void;
  index: number;
}

const ENERGY_COLOUR: Record<string, string> = {
  low: '#3A5C45',
  medium: '#2D4A6B',
  high: '#7A4A30',
};

const ENERGY_BG: Record<string, string> = {
  low: '#E8F0EC',
  medium: '#E8EFF7',
  high: '#F0E8E0',
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

// Category gradient for photo-less hero — earthy, muted palette
const CATEGORY_GRADIENT: Record<string, string> = {
  playground_adventure: 'linear-gradient(135deg, #3A5C45 0%, #2A4232 100%)',
  museum_mission:       'linear-gradient(135deg, #3A3550 0%, #252338 100%)',
  soft_play:            'linear-gradient(135deg, #7A4A5C 0%, #5A3245 100%)',
  cheap_cinema:         'linear-gradient(135deg, #6B4A28 0%, #4A3018 100%)',
  nature_walk:          'linear-gradient(135deg, #2E5040 0%, #1E3828 100%)',
  at_home_creative:     'linear-gradient(135deg, #7A4A30 0%, #583220 100%)',
  local_event:          'linear-gradient(135deg, #2D4A6B 0%, #1E3250 100%)',
};

export default function ActivityCard({ activity, onAccept, onReject, index }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [photoError, setPhotoError] = useState(false);

  const hasPhoto = !photoError && !!activity.venue?.photoName;
  const photoUrl = activity.venue?.photoName
    ? `/api/photo?name=${encodeURIComponent(activity.venue.photoName)}`
    : null;

  const costLabel =
    activity.costPerChild === 0 ? 'Free' : `£${activity.costPerChild.toFixed(0)}/child`;

  return (
    <div
      className="card animate-fade-in"
      style={{ animationDelay: `${index * 80}ms`, overflow: 'hidden' }}
    >
      {/* Tappable header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          padding: 0,
          display: 'block',
        }}
      >
        {/* Photo hero or emoji header */}
        {hasPhoto && photoUrl ? (
          <div style={{ position: 'relative', height: 180, overflow: 'hidden', borderRadius: '8px 8px 0 0' }}>
            <img
              src={photoUrl}
              alt={activity.venue!.name}
              onError={() => setPhotoError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            {/* Gradient overlay with title */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.72) 100%)',
                display: 'flex',
                alignItems: 'flex-end',
                padding: '16px',
              }}
            >
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  margin: 0,
                  color: '#fff',
                  lineHeight: 1.2,
                  textShadow: '0 1px 4px rgba(0,0,0,0.4)',
                }}
              >
                {activity.title}{activity.venue ? ` (${activity.venue.name})` : ''}
              </h3>
            </div>
          </div>
        ) : (
          // Gradient hero for photo-less activities
          <div
            style={{
              position: 'relative',
              height: 140,
              overflow: 'hidden',
              borderRadius: '8px 8px 0 0',
              background: CATEGORY_GRADIENT[activity.category] ?? 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, opacity: 0.25 }}>
              {CATEGORY_EMOJI[activity.category] ?? activity.emoji}
            </div>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 20%, rgba(0,0,0,0.5) 100%)', display: 'flex', alignItems: 'flex-end', padding: '14px 16px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#fff', lineHeight: 1.2, textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
                {activity.title}{activity.venue ? ` (${activity.venue.name})` : ''}
              </h3>
            </div>
          </div>
        )}

        {/* Badges row */}
        <div
          style={{
            padding: '10px 16px 14px',
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              background: 'var(--color-brand-light)',
              color: 'var(--color-brand)',
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: 3,
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {costLabel}
          </span>

          <span
            style={{
              background: ENERGY_BG[activity.energyLevel] ?? '#F3F4F6',
              color: ENERGY_COLOUR[activity.energyLevel] ?? 'var(--color-text-muted)',
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: 4,
              fontFamily: 'var(--font-display)',
            }}
          >
            {CATEGORY_EMOJI[activity.category]} {activity.duration}
          </span>

          {activity.venue?.rating && (
            <span
              style={{
                background: 'var(--color-amber-light)',
                color: 'var(--color-amber)',
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 3,
                fontFamily: 'var(--font-display)',
                letterSpacing: '0.04em',
              }}
            >
              {activity.venue.rating.toFixed(1)}
            </span>
          )}

          {activity.venue?.openNow === false && (
            <span
              style={{
                background: 'var(--color-rose-light)',
                color: 'var(--color-rose)',
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 3,
                fontFamily: 'var(--font-display)',
                letterSpacing: '0.04em',
              }}
            >
              May be closed
            </span>
          )}

          {activity.venue && (
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}
            >
              {activity.venue.name}
            </span>
          )}

          <span
            style={{
              marginLeft: 'auto',
              fontSize: 16,
              color: 'var(--color-text-faint)',
              transition: 'transform 0.2s',
              transform: expanded ? 'rotate(180deg)' : 'none',
              flexShrink: 0,
            }}
          >
            ↓
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div
          className="animate-fade-in"
          style={{ borderTop: '1px solid var(--color-border)', padding: '16px 18px 20px' }}
        >
          {/* Plan */}
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              margin: '0 0 10px',
            }}
          >
            The plan
          </p>
          <ol style={{ margin: '0 0 20px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activity.plan.map((step, i) => (
              <li key={i} style={{ fontSize: '0.875rem', color: 'var(--color-text)', lineHeight: 1.45 }}>
                {step}
              </li>
            ))}
          </ol>

          {/* Why it works */}
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              margin: '0 0 10px',
            }}
          >
            Why it works
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {activity.whyItWorks.map((w, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--color-bg)',
                  borderRadius: 6,
                  padding: '10px 14px',
                  borderLeft: '2px solid var(--color-brand)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    color: 'var(--color-brand)',
                  }}
                >
                  {w.name}, {w.age}
                </span>
                <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {w.reason}
                </p>
              </div>
            ))}
          </div>

          {/* Venue */}
          {activity.venue && (
            <div
              style={{
                background: 'var(--color-bg)',
                borderRadius: 6,
                padding: '12px 14px',
                marginBottom: 20,
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 16, marginTop: 1 }}>📍</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activity.venue.name + ' ' + activity.venue.address)}&query_place_id=${activity.venue.placeId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-brand)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    {activity.venue.name}
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </a>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                    {activity.venue.address}
                  </div>
                  {/* Rating & price */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    {activity.venue.rating && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                        ⭐ {activity.venue.rating.toFixed(1)}
                      </span>
                    )}
                    {activity.venue.priceLevel && activity.venue.priceLevel !== 'PRICE_LEVEL_UNSPECIFIED' && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                        {activity.venue.priceLevel === 'PRICE_LEVEL_FREE' ? 'Free entry' :
                         activity.venue.priceLevel === 'PRICE_LEVEL_INEXPENSIVE' ? '£ Budget-friendly' :
                         activity.venue.priceLevel === 'PRICE_LEVEL_MODERATE' ? '££ Moderate' :
                         activity.venue.priceLevel === 'PRICE_LEVEL_EXPENSIVE' ? '£££ Pricey' : ''}
                      </span>
                    )}
                    {!activity.venue.openNow && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-rose)', fontWeight: 600 }}>
                        May be closed now
                      </span>
                    )}
                  </div>
                  {/* Today's hours */}
                  {activity.venue.openingHours && activity.venue.openingHours.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                        Opening hours
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {activity.venue.openingHours.map((h, i) => (
                          <div key={i} style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{h}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Website & phone */}
                  <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                    {activity.venue.website && (
                      <a
                        href={activity.venue.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: '0.78rem', color: 'var(--color-terracotta)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}
                      >
                        🌐 Website
                      </a>
                    )}
                    {activity.venue.phoneNumber && (
                      <a
                        href={`tel:${activity.venue.phoneNumber}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: '0.78rem', color: 'var(--color-terracotta)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}
                      >
                        📞 {activity.venue.phoneNumber}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn-secondary"
              style={{ flex: 1, fontSize: '0.9rem' }}
              onClick={(e) => { e.stopPropagation(); onReject(activity); }}
            >
              Not today
            </button>
            <button
              className="btn-primary"
              style={{ flex: 2 }}
              onClick={(e) => { e.stopPropagation(); onAccept(activity); }}
            >
              Let&apos;s do this! 🎉
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
