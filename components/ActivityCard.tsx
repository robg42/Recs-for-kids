'use client';

import { useState, useRef } from 'react';
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

const CATEGORY_GRADIENT: Record<string, string> = {
  playground_adventure: 'linear-gradient(135deg, #3A5C45 0%, #2A4232 100%)',
  museum_mission:       'linear-gradient(135deg, #3A3550 0%, #252338 100%)',
  soft_play:            'linear-gradient(135deg, #7A4A5C 0%, #5A3245 100%)',
  cheap_cinema:         'linear-gradient(135deg, #6B4A28 0%, #4A3018 100%)',
  nature_walk:          'linear-gradient(135deg, #2E5040 0%, #1E3828 100%)',
  at_home_creative:     'linear-gradient(135deg, #7A4A30 0%, #583220 100%)',
  local_event:          'linear-gradient(135deg, #2D4A6B 0%, #1E3250 100%)',
};

type DismissAnimation = 'none' | 'slide-left' | 'crumple';

export default function ActivityCard({ activity, onAccept, onReject, index }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [dismissAnim, setDismissAnim] = useState<DismissAnimation>('none');
  const [blockUndo, setBlockUndo] = useState(false); // show undo snackbar
  const [blockCommitted, setBlockCommitted] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unified image resolution (priority: event image > venue photo > category gradient)
  // All real images are routed through /api/photo so img-src 'self' CSP stays clean.
  const resolvedImageUrl = (() => {
    if (activity.imageUrl) {
      // Pre-resolved external URL (Eventbrite logo / Serper thumbnail)
      return `/api/photo?url=${encodeURIComponent(activity.imageUrl)}`;
    }
    if (activity.venue?.photoName) {
      // Google Places photo reference
      return `/api/photo?name=${encodeURIComponent(activity.venue.photoName)}`;
    }
    return null;
  })();
  const hasImage = !photoError && !!resolvedImageUrl;

  const costLabel =
    activity.costPerChild === 0 ? 'Free' : `£${activity.costPerChild.toFixed(0)}/child`;

  // ── Dismiss: slide off left (used for "not today" / reject) ────────────────
  function handleRejectWithAnimation() {
    setDismissAnim('slide-left');
    setTimeout(() => onReject(activity), 420);
  }

  // ── Block place: crumple animation then undo snackbar ─────────────────────
  function handleBlockPlace(e: React.MouseEvent) {
    e.stopPropagation();
    if (!activity.venue) return;
    setDismissAnim('crumple');
    setBlockUndo(true);

    // 5 second undo window
    undoTimerRef.current = setTimeout(() => {
      commitBlock();
    }, 5000);
  }

  function handleUndoBlock(e: React.MouseEvent) {
    e.stopPropagation();
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setDismissAnim('none');
    setBlockUndo(false);
  }

  function commitBlock() {
    if (!activity.venue || blockCommitted) return;
    setBlockCommitted(true);
    setBlockUndo(false);
    // Fire-and-forget — optimistic UI, non-critical if it fails
    fetch('/api/blocked-places', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        placeId: activity.venue.placeId,
        placeName: activity.venue.name,
        address: activity.venue.address ?? '',
      }),
    }).catch(() => {}); // Silent on network error
    onReject(activity);
  }

  const animStyle: React.CSSProperties =
    dismissAnim === 'slide-left'
      ? {
          transform: 'translateX(-110%) rotate(-6deg)',
          opacity: 0,
          transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease',
          pointerEvents: 'none',
        }
      : dismissAnim === 'crumple'
      ? {
          transform: 'scale(0.4) rotate(-15deg)',
          opacity: 0,
          filter: 'blur(2px)',
          transition:
            'transform 0.45s cubic-bezier(0.6, -0.28, 0.74, 0.05), opacity 0.4s ease, filter 0.4s ease',
          pointerEvents: 'none',
        }
      : {};

  return (
    <div style={{ position: 'relative', marginBottom: 0 }}>
      {/* Card */}
      <div
        className="card animate-fade-in"
        style={{
          animationDelay: `${index * 80}ms`,
          overflow: 'hidden',
          transformOrigin: 'center center',
          ...animStyle,
        }}
      >
        {/* Tappable header */}
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, display: 'block' }}
        >
          {/* Photo hero or polished gradient fallback — always 180px for layout consistency */}
          {hasImage && resolvedImageUrl ? (
            <div style={{ position: 'relative', height: 180, overflow: 'hidden', borderRadius: '8px 8px 0 0' }}>
              <img
                src={resolvedImageUrl}
                alt={activity.title}
                onError={() => setPhotoError(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.72) 100%)', display: 'flex', alignItems: 'flex-end', padding: '16px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#fff', lineHeight: 1.2, textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
                  {activity.title}{activity.venue ? ` (${activity.venue.name})` : ''}
                </h3>
              </div>
            </div>
          ) : (
            /* Polished gradient fallback — same height as photo for visual consistency.
               Large activity emoji as visual anchor; category emoji as subtle watermark. */
            <div style={{ position: 'relative', height: 180, overflow: 'hidden', borderRadius: '8px 8px 0 0', background: CATEGORY_GRADIENT[activity.category] ?? 'linear-gradient(135deg, #3A5C45 0%, #2A4232 100%)' }}>
              {/* Watermark pattern: two overlapping emojis at different scales */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none', pointerEvents: 'none' }}>
                <span style={{ fontSize: 96, opacity: 0.12, lineHeight: 1 }}>
                  {activity.emoji}
                </span>
              </div>
              <div style={{ position: 'absolute', top: 14, right: 18, fontSize: 28, opacity: 0.2, userSelect: 'none', pointerEvents: 'none' }}>
                {CATEGORY_EMOJI[activity.category]}
              </div>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 20%, rgba(0,0,0,0.55) 100%)', display: 'flex', alignItems: 'flex-end', padding: '16px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, margin: 0, color: '#fff', lineHeight: 1.2, textShadow: '0 1px 4px rgba(0,0,0,0.35)' }}>
                  {activity.title}{activity.venue ? ` (${activity.venue.name})` : ''}
                </h3>
              </div>
            </div>
          )}

          {/* Badges row */}
          <div style={{ padding: '10px 16px 14px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ background: 'var(--color-brand-light)', color: 'var(--color-brand)', fontSize: '0.68rem', fontWeight: 700, padding: '3px 10px', borderRadius: 3, fontFamily: 'var(--font-display)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {costLabel}
            </span>
            <span style={{ background: ENERGY_BG[activity.energyLevel] ?? '#F3F4F6', color: ENERGY_COLOUR[activity.energyLevel] ?? 'var(--color-text-muted)', fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 4, fontFamily: 'var(--font-display)' }}>
              {CATEGORY_EMOJI[activity.category]} {activity.duration}
            </span>
            {activity.venue?.rating && (
              <span style={{ background: 'var(--color-amber-light)', color: 'var(--color-amber)', fontSize: '0.68rem', fontWeight: 700, padding: '3px 10px', borderRadius: 3, fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>
                {activity.venue.rating.toFixed(1)}
              </span>
            )}
            {activity.venue?.openNow === false && (
              <span style={{ background: 'var(--color-rose-light)', color: 'var(--color-rose)', fontSize: '0.68rem', fontWeight: 700, padding: '3px 10px', borderRadius: 3, fontFamily: 'var(--font-display)' }}>
                May be closed
              </span>
            )}
            {activity.sourceUrl && (
              <span style={{ background: '#FFF3E0', color: '#E65100', fontSize: '0.68rem', fontWeight: 700, padding: '3px 10px', borderRadius: 3, fontFamily: 'var(--font-display)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                🎟 Event
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 16, color: 'var(--color-text-faint)', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>↓</span>
          </div>
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="animate-fade-in" style={{ borderTop: '1px solid var(--color-border)', padding: '16px 18px 20px' }}>
            {/* Plan */}
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>
              The plan
            </p>
            <ol style={{ margin: '0 0 20px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activity.plan.map((step, i) => (
                <li key={i} style={{ fontSize: '0.875rem', color: 'var(--color-text)', lineHeight: 1.45 }}>{step}</li>
              ))}
            </ol>

            {/* Why it works */}
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>
              Why it works
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {activity.whyItWorks.map((w, i) => (
                <div key={i} style={{ background: 'var(--color-bg)', borderRadius: 6, padding: '10px 14px', borderLeft: '2px solid var(--color-brand)' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--color-brand)' }}>
                    {w.name}, {w.age}
                  </span>
                  <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>{w.reason}</p>
                </div>
              ))}
            </div>

            {/* Venue */}
            {activity.venue && (
              <div style={{ background: 'var(--color-bg)', borderRadius: 6, padding: '12px 14px', marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 16, marginTop: 1 }}>📍</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <a
                      href={`https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: activity.venue.name + ' ' + activity.venue.address, query_place_id: activity.venue.placeId }).toString()}`}
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
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{activity.venue.address}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      {activity.venue.rating && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>⭐ {activity.venue.rating.toFixed(1)}</span>
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
                        <span style={{ fontSize: '0.78rem', color: 'var(--color-rose)', fontWeight: 600 }}>May be closed now</span>
                      )}
                    </div>
                    {activity.venue.openingHours && activity.venue.openingHours.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Opening hours</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {activity.venue.openingHours.map((h, i) => (
                            <div key={i} style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{h}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                      {activity.venue.website && (
                        <a href={activity.venue.website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: '0.78rem', color: 'var(--color-terracotta)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                          🌐 Website
                        </a>
                      )}
                      {activity.venue.phoneNumber && (
                        <a href={`tel:${activity.venue.phoneNumber}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: '0.78rem', color: 'var(--color-terracotta)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                          📞 {activity.venue.phoneNumber}
                        </a>
                      )}
                    </div>

                    {/* Block place action */}
                    <button
                      onClick={handleBlockPlace}
                      style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, fontSize: '0.75rem', color: 'var(--color-text-faint)', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                    >
                      Don&apos;t recommend this place again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Eventbrite / source URL */}
            {activity.sourceUrl && (
              <div style={{ marginBottom: 20 }}>
                <a
                  href={activity.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FF6B35', color: '#fff', borderRadius: 8, padding: '9px 16px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none' }}
                >
                  🎟 View on Eventbrite
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn-secondary"
                style={{ flex: 1, fontSize: '0.9rem' }}
                onClick={(e) => { e.stopPropagation(); handleRejectWithAnimation(); }}
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

      {/* Block-place undo snackbar */}
      {blockUndo && (
        <div
          className="animate-fade-in"
          style={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--color-brand)',
            color: '#fff',
            borderRadius: 999,
            padding: '8px 16px',
            fontSize: '0.8rem',
            fontWeight: 600,
            fontFamily: 'var(--font-display)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            zIndex: 10,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          Place blocked
          <button
            onClick={handleUndoBlock}
            style={{ background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: 6, padding: '2px 10px', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
