'use client';

import { useState, useRef } from 'react';
import type { Activity } from '@/types';

interface Props {
  activity: Activity;
  onAccept: (activity: Activity) => void;
  onSkip: (activity: Activity) => void;
  index: number;
}

const CATEGORY_GRADIENT: Record<string, string> = {
  playground_adventure: 'linear-gradient(135deg, #3A5C45 0%, #2A4232 100%)',
  museum_mission:       'linear-gradient(135deg, #3A3550 0%, #252338 100%)',
  soft_play:            'linear-gradient(135deg, #7A4A5C 0%, #5A3245 100%)',
  cheap_cinema:         'linear-gradient(135deg, #6B4A28 0%, #4A3018 100%)',
  nature_walk:          'linear-gradient(135deg, #2E5040 0%, #1E3828 100%)',
  at_home_creative:     'linear-gradient(135deg, #7A4A30 0%, #583220 100%)',
  local_event:          'linear-gradient(135deg, #2D4A6B 0%, #1E3250 100%)',
};

type DismissAnim = 'slide' | 'crumple' | null;

export default function ActivityCardV2({ activity, onAccept, onSkip, index }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [dismissed, setDismissed] = useState<DismissAnim>(null);
  const [blockUndo, setBlockUndo] = useState(false);
  const [blockCommitted, setBlockCommitted] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const imageUrl = (() => {
    if (activity.imageUrl) return `/api/photo?url=${encodeURIComponent(activity.imageUrl)}`;
    if (activity.venue?.photoName) return `/api/photo?name=${encodeURIComponent(activity.venue.photoName)}`;
    return null;
  })();
  const hasImage = !photoError && !!imageUrl;

  const costLabel = activity.costPerChild === 0 ? 'Free' : `£${activity.costPerChild.toFixed(0)}/child`;

  function handleSkip(e?: React.MouseEvent) {
    e?.stopPropagation();
    setDismissed('slide');
    setTimeout(() => onSkip(activity), 400);
  }

  function handleBlockPlace(e: React.MouseEvent) {
    e.stopPropagation();
    if (!activity.venue) return;
    setDismissed('crumple');
    setBlockUndo(true);
    undoTimerRef.current = setTimeout(() => commitBlock(), 5000);
  }

  function handleUndoBlock(e: React.MouseEvent) {
    e.stopPropagation();
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setDismissed(null);
    setBlockUndo(false);
  }

  function commitBlock() {
    if (!activity.venue || blockCommitted) return;
    setBlockCommitted(true);
    setBlockUndo(false);
    fetch('/api/blocked-places', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        placeId: activity.venue.placeId,
        placeName: activity.venue.name,
        address: activity.venue.address ?? '',
      }),
    }).catch(() => {});
    onSkip(activity);
  }

  const animStyle: React.CSSProperties =
    dismissed === 'slide'
      ? { transform: 'translateX(-110%) rotate(-6deg)', opacity: 0, transition: 'transform 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease', pointerEvents: 'none' }
      : dismissed === 'crumple'
      ? { transform: 'scale(0.4) rotate(-15deg)', opacity: 0, filter: 'blur(2px)', transition: 'transform 0.45s cubic-bezier(0.6,-0.28,0.74,0.05), opacity 0.4s ease, filter 0.4s ease', pointerEvents: 'none' }
      : {};

  return (
    <div style={{ position: 'relative' }}>
      <div
        className="card animate-fade-in"
        style={{ animationDelay: `${index * 80}ms`, overflow: 'hidden', transformOrigin: 'center center', padding: 0, ...animStyle }}
      >
        {/* ── Hero image / gradient ── */}
        <div style={{
          position: 'relative',
          height: hasImage ? 220 : 140,
          overflow: 'hidden',
          background: hasImage ? '#111' : (CATEGORY_GRADIENT[activity.category] ?? CATEGORY_GRADIENT.nature_walk),
        }}>
          {hasImage && imageUrl && (
            <img
              src={imageUrl}
              alt={activity.title}
              onError={() => setPhotoError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )}
          {!hasImage && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 72, opacity: 0.15 }}>{activity.emoji}</span>
            </div>
          )}
          {/* Gradient overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.82) 100%)',
          }} />
          {/* Pass button — top right */}
          <button
            onClick={handleSkip}
            style={{
              position: 'absolute', top: 10, right: 10,
              background: 'rgba(0,0,0,0.45)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 4, padding: '5px 11px',
              color: 'rgba(255,255,255,0.88)',
              fontSize: '0.68rem', fontFamily: 'var(--font-display)',
              fontWeight: 700, cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}
          >
            Pass
          </button>
          {/* Title + meta overlaid on image */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '14px 14px 12px' }}>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800,
              margin: '0 0 6px', color: '#fff', lineHeight: 1.2,
              textShadow: '0 1px 6px rgba(0,0,0,0.5)',
            }}>
              {activity.emoji} {activity.title}
            </h3>
            {/* Quick meta pills */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
              <Pill variant="cost">{costLabel}</Pill>
              <Pill variant="meta">{activity.duration}</Pill>
              {activity.venue && <Pill variant="meta">📍 {activity.venue.name}</Pill>}
              {activity.venue?.rating && <Pill variant="rating">⭐ {activity.venue.rating.toFixed(1)}</Pill>}
              {activity.venue?.openNow === false && <Pill variant="warning">May be closed</Pill>}
              {activity.sourceUrl && <Pill variant="event">🎟 Event</Pill>}
            </div>
          </div>
        </div>

        {/* ── Why it works — visible without expanding ── */}
        {activity.whyItWorks && activity.whyItWorks.length > 0 && (
          <div style={{
            padding: '12px 14px 10px',
            borderBottom: '1px solid var(--color-border)',
          }}>
            <p style={{
              fontFamily: 'var(--font-display)', fontSize: '0.65rem', fontWeight: 700,
              color: 'var(--color-brand)', textTransform: 'uppercase', letterSpacing: '0.1em',
              margin: '0 0 7px',
            }}>
              Why it works for your kids
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activity.whyItWorks.map((w, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.72rem',
                    color: 'var(--color-brand)', whiteSpace: 'nowrap', marginTop: 1, flexShrink: 0,
                  }}>
                    {w.name}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                    {w.reason}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Expand toggle ── */}
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: expanded ? '1px solid var(--color-border)' : 'none',
          }}
        >
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
            {expanded ? 'Hide the plan' : 'See the plan & venue details'}
          </span>
          <span style={{
            fontSize: 13, color: 'var(--color-text-faint)',
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}>↓</span>
        </button>

        {/* ── Expanded content ── */}
        {expanded && (
          <div className="animate-fade-in" style={{ padding: '16px 16px 18px' }}>

            {/* Plan */}
            <Label>The plan</Label>
            <ol style={{ margin: '0 0 20px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {activity.plan.map((step, i) => (
                <li key={i} style={{ fontSize: '0.875rem', lineHeight: 1.5, color: 'var(--color-text)' }}>{step}</li>
              ))}
            </ol>

            {/* Venue */}
            {activity.venue && (
              <div style={{ background: 'var(--color-bg)', borderRadius: 6, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }}>📍</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <a
                      href={`https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: activity.venue.name + ' ' + activity.venue.address, query_place_id: activity.venue.placeId }).toString()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-brand)', textDecoration: 'none' }}
                    >
                      {activity.venue.name} ↗
                    </a>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                      {activity.venue.address}
                    </div>
                    {activity.venue.priceLevel && activity.venue.priceLevel !== 'PRICE_LEVEL_UNSPECIFIED' && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-faint)', marginTop: 2 }}>
                        {activity.venue.priceLevel === 'PRICE_LEVEL_FREE' ? 'Free entry'
                          : activity.venue.priceLevel === 'PRICE_LEVEL_INEXPENSIVE' ? '£ Budget-friendly'
                          : activity.venue.priceLevel === 'PRICE_LEVEL_MODERATE' ? '££ Moderate'
                          : activity.venue.priceLevel === 'PRICE_LEVEL_EXPENSIVE' ? '£££ Pricey' : ''}
                      </div>
                    )}
                    {activity.venue.openingHours && activity.venue.openingHours.length > 0 && (
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {activity.venue.openingHours.map((h, i) => (
                          <div key={i} style={{ fontSize: '0.72rem', color: 'var(--color-text-faint)' }}>{h}</div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {activity.venue.website && (
                        <a href={activity.venue.website} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize: '0.78rem', color: 'var(--color-terracotta)', fontWeight: 600, textDecoration: 'none' }}>
                          🌐 Website
                        </a>
                      )}
                      {activity.venue.phoneNumber && (
                        <a href={`tel:${activity.venue.phoneNumber}`}
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize: '0.78rem', color: 'var(--color-terracotta)', fontWeight: 600, textDecoration: 'none' }}>
                          📞 {activity.venue.phoneNumber}
                        </a>
                      )}
                      <button
                        onClick={handleBlockPlace}
                        style={{ background: 'none', border: 'none', padding: 0, fontSize: '0.72rem', color: 'var(--color-text-faint)', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                      >
                        Don&apos;t recommend this place again
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Eventbrite link */}
            {activity.sourceUrl && (
              <div style={{ marginBottom: 16 }}>
                <a
                  href={activity.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FF6B35', color: '#fff', borderRadius: 6, padding: '9px 16px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none' }}
                >
                  🎟 View event ↗
                </a>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-secondary"
                style={{ flex: 1 }}
                onClick={e => { e.stopPropagation(); handleSkip(); }}
              >
                Not today
              </button>
              <button
                className="btn-primary"
                style={{ flex: 2 }}
                onClick={e => { e.stopPropagation(); onAccept(activity); }}
              >
                Let&apos;s go! 🎉
              </button>
            </div>
          </div>
        )}

        {/* Let's go CTA — always visible when not expanded */}
        {!expanded && (
          <div style={{ padding: '0 14px 14px', display: 'flex', gap: 8 }}>
            <button
              className="btn-primary"
              style={{ flex: 1 }}
              onClick={e => { e.stopPropagation(); onAccept(activity); }}
            >
              Let&apos;s do this! 🎉
            </button>
          </div>
        )}
      </div>

      {/* Block-place undo snackbar */}
      {blockUndo && (
        <div
          className="animate-fade-in"
          style={{
            position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--color-brand)', color: '#fff', borderRadius: 999,
            padding: '8px 16px', fontSize: '0.8rem', fontWeight: 600,
            fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center',
            gap: 10, zIndex: 10, whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          Place blocked
          <button
            onClick={handleUndoBlock}
            style={{ background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: 4, padding: '2px 10px', color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

// ── Internal helper components ────────────────────────────────────────────────

function Pill({ children, variant }: {
  children: React.ReactNode;
  variant: 'cost' | 'meta' | 'rating' | 'warning' | 'event';
}) {
  const s: React.CSSProperties =
    variant === 'cost'    ? { background: 'rgba(255,255,255,0.2)', color: '#fff', backdropFilter: 'blur(4px)' }
    : variant === 'rating'  ? { background: 'rgba(255,200,50,0.25)', color: '#FFD700' }
    : variant === 'warning' ? { background: 'rgba(220,60,60,0.3)', color: '#ff9999' }
    : variant === 'event'   ? { background: 'rgba(255,107,53,0.3)', color: '#FFB899' }
    : { background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)' };
  return (
    <span style={{
      ...s,
      fontSize: '0.65rem', fontWeight: 700, padding: '3px 7px',
      borderRadius: 3, fontFamily: 'var(--font-display)',
      letterSpacing: '0.02em', whiteSpace: 'nowrap',
      maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block',
    }}>
      {children}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: 'var(--font-display)', fontSize: '0.65rem', fontWeight: 700,
      color: 'var(--color-text-faint)', textTransform: 'uppercase',
      letterSpacing: '0.09em', margin: '0 0 8px',
    }}>
      {children}
    </p>
  );
}
