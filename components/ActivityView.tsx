'use client';

import { useState, useRef } from 'react';
import type { Activity } from '@/types';

/**
 * ActivityView — immersive, full-bleed, magazine-style activity presentation.
 *
 * Visual language: dark hero that fills the top half of the viewport,
 * clean editorial content below. No cards, no pills, no rounded containers.
 * Typography-driven — Space Grotesk display, DM Sans body.
 */

interface Props {
  activity: Activity;
  onAccept: () => void;
  onNext: () => void;
}

// Muted tint for each category — used as a thin accent line, nothing more
const CAT_TINT: Record<string, string> = {
  playground_adventure: '#4CAF50',
  museum_mission: '#7C4DFF',
  soft_play: '#FF5252',
  cheap_cinema: '#FF9100',
  nature_walk: '#009688',
  at_home_creative: '#FFC107',
  local_event: '#2979FF',
};

// Gradient fallbacks when no photo — rich, immersive full-screen gradients
const CAT_GRADIENT: Record<string, string> = {
  playground_adventure: 'linear-gradient(160deg, #1b5e20 0%, #2e7d32 40%, #388e3c 100%)',
  museum_mission:       'linear-gradient(160deg, #311b92 0%, #4527a0 40%, #5e35b1 100%)',
  soft_play:            'linear-gradient(160deg, #b71c1c 0%, #c62828 40%, #d32f2f 100%)',
  cheap_cinema:         'linear-gradient(160deg, #e65100 0%, #ef6c00 40%, #f57c00 100%)',
  nature_walk:          'linear-gradient(160deg, #004d40 0%, #00695c 40%, #00796b 100%)',
  at_home_creative:     'linear-gradient(160deg, #f57f17 0%, #f9a825 40%, #fbc02d 100%)',
  local_event:          'linear-gradient(160deg, #0d47a1 0%, #1565c0 40%, #1976d2 100%)',
};

const DEFAULT_GRADIENT = 'linear-gradient(160deg, #212121 0%, #424242 40%, #616161 100%)';

export default function ActivityView({ activity, onAccept, onNext }: Props) {
  const [photoError, setPhotoError] = useState(false);
  const [blockUndo, setBlockUndo] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tint = CAT_TINT[activity.category] ?? '#888';
  const gradient = CAT_GRADIENT[activity.category] ?? DEFAULT_GRADIENT;

  const imageUrl = (() => {
    if (activity.imageUrl) return `/api/photo?url=${encodeURIComponent(activity.imageUrl)}`;
    if (activity.venue?.photoName) return `/api/photo?name=${encodeURIComponent(activity.venue.photoName)}`;
    return null;
  })();
  const hasImage = !photoError && !!imageUrl;

  const cost = activity.costPerChild === 0 ? 'Free' : `£${activity.costPerChild.toFixed(0)} per child`;

  function handleBlock() {
    if (!activity.venue) return;
    setBlockUndo(true);
    undoTimer.current = setTimeout(() => {
      setBlockUndo(false);
      fetch('/api/blocked-places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: activity.venue!.placeId,
          placeName: activity.venue!.name,
          address: activity.venue!.address ?? '',
        }),
      }).catch(() => {});
    }, 4000);
  }

  function handleUndo() {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setBlockUndo(false);
  }

  const mapsUrl = activity.venue
    ? `https://www.google.com/maps/search/?${new URLSearchParams({
        api: '1',
        query: `${activity.venue.name} ${activity.venue.address}`,
        query_place_id: activity.venue.placeId,
      })}`
    : null;

  return (
    <div className="animate-crossfade">

      {/* ═══════════════════════════════════════════════════════════════════════
          HERO — full-bleed, edge-to-edge, immersive
          ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{
        position: 'relative',
        width: 'calc(100% + 32px)',
        marginLeft: -16,
        height: '56vh',
        minHeight: 340,
        maxHeight: 520,
        overflow: 'hidden',
      }}>
        {hasImage && imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            onError={() => setPhotoError(true)}
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover', display: 'block',
            }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: gradient,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{
              fontSize: 120, opacity: 0.15,
              filter: 'blur(1px)',
            }}>
              {activity.emoji}
            </span>
          </div>
        )}

        {/* Heavy gradient scrim — text lives on the image */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.1) 70%, transparent 100%)',
        }} />

        {/* Content overlaid on image */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '0 24px 28px',
        }}>
          {/* Category + facts line */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            marginBottom: 12,
            fontFamily: 'var(--font-dm), var(--font-body)',
            fontSize: '0.82rem',
            color: 'rgba(255,255,255,0.7)',
            fontWeight: 500,
          }}>
            <span>{cost}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{activity.duration}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{activity.energyLevel === 'low' ? 'Relaxed' : activity.energyLevel === 'medium' ? 'Active' : 'High energy'}</span>
          </div>

          {/* Title */}
          <h1 style={{
            margin: 0, color: '#fff',
            fontFamily: 'var(--font-space), var(--font-display)',
            fontWeight: 700,
            fontSize: '2rem',
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
          }}>
            {activity.title}
          </h1>

          {/* Venue on hero */}
          {activity.venue && (
            <a
              href={mapsUrl!}
              target="_blank" rel="noopener noreferrer"
              style={{
                display: 'inline-block', marginTop: 10,
                fontFamily: 'var(--font-dm), var(--font-body)',
                fontSize: '0.86rem', color: 'rgba(255,255,255,0.65)',
                textDecoration: 'none', fontWeight: 500,
              }}
            >
              {activity.venue.name}
              {activity.venue.rating ? ` · ${activity.venue.rating.toFixed(1)}★` : ''}
              {' '}
              <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>↗</span>
            </a>
          )}
        </div>
      </div>

      {/* Thin accent line */}
      <div style={{ height: 3, background: tint, opacity: 0.8 }} />


      {/* ═══════════════════════════════════════════════════════════════════════
          CONTENT — clean editorial below the hero
          ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ padding: '28px 0 0' }}>

        {/* ── Why your kids will love it ── */}
        {activity.whyItWorks.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            {activity.whyItWorks.map((w, i) => (
              <div key={i} style={{
                marginBottom: i < activity.whyItWorks.length - 1 ? 20 : 0,
              }}>
                <div style={{
                  fontFamily: 'var(--font-space), var(--font-display)',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  color: '#1a1a1a',
                  marginBottom: 4,
                }}>
                  {w.name}, age {w.age}
                </div>
                <div style={{
                  fontFamily: 'var(--font-dm), var(--font-body)',
                  fontSize: '0.92rem',
                  lineHeight: 1.6,
                  color: '#555',
                }}>
                  {w.reason}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── The plan ── */}
        {activity.plan.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{
              fontFamily: 'var(--font-space), var(--font-display)',
              fontWeight: 700, fontSize: '0.78rem',
              textTransform: 'uppercase', letterSpacing: '0.12em',
              color: '#aaa', marginBottom: 16,
            }}>
              The plan
            </div>
            {activity.plan.map((step, i) => (
              <div key={i} style={{
                display: 'flex', gap: 16, alignItems: 'baseline',
                marginBottom: 14,
              }}>
                <span style={{
                  fontFamily: 'var(--font-space), var(--font-display)',
                  fontWeight: 700, fontSize: '1.4rem',
                  color: '#ddd', lineHeight: 1,
                  minWidth: 28, textAlign: 'right',
                }}>
                  {i + 1}
                </span>
                <span style={{
                  fontFamily: 'var(--font-dm), var(--font-body)',
                  fontSize: '0.92rem', lineHeight: 1.6, color: '#444',
                  flex: 1,
                }}>
                  {step}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Venue details ── */}
        {activity.venue && (
          <div style={{
            borderTop: '1px solid #eee',
            paddingTop: 24,
            marginBottom: 24,
          }}>
            <div style={{
              fontFamily: 'var(--font-space), var(--font-display)',
              fontWeight: 700, fontSize: '0.78rem',
              textTransform: 'uppercase', letterSpacing: '0.12em',
              color: '#aaa', marginBottom: 14,
            }}>
              Getting there
            </div>

            <div style={{
              fontFamily: 'var(--font-space), var(--font-display)',
              fontWeight: 600, fontSize: '1rem', color: '#1a1a1a',
              marginBottom: 4,
            }}>
              {activity.venue.name}
            </div>
            <div style={{
              fontFamily: 'var(--font-dm), var(--font-body)',
              fontSize: '0.86rem', color: '#888', marginBottom: 12,
            }}>
              {activity.venue.address}
            </div>

            {activity.venue.openNow === false && (
              <div style={{
                fontFamily: 'var(--font-dm), var(--font-body)',
                fontSize: '0.82rem', color: '#d32f2f', fontWeight: 600,
                marginBottom: 10,
              }}>
                May be closed right now
              </div>
            )}

            {activity.venue.openingHours && activity.venue.openingHours.length > 0 && (
              <details style={{ marginBottom: 14 }}>
                <summary style={{
                  fontFamily: 'var(--font-dm), var(--font-body)',
                  fontSize: '0.82rem', color: '#999', cursor: 'pointer', fontWeight: 500,
                }}>
                  Opening hours
                </summary>
                <div style={{
                  marginTop: 8,
                  display: 'flex', flexDirection: 'column', gap: 3,
                  paddingLeft: 2,
                }}>
                  {activity.venue.openingHours.map((h, i) => (
                    <div key={i} style={{
                      fontFamily: 'var(--font-dm), var(--font-body)',
                      fontSize: '0.8rem', color: '#999',
                    }}>
                      {h}
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Action links — underlined text, not buttons */}
            <div style={{
              display: 'flex', gap: 24, flexWrap: 'wrap',
              fontFamily: 'var(--font-dm), var(--font-body)',
              fontSize: '0.86rem', fontWeight: 600,
            }}>
              <a href={mapsUrl!} target="_blank" rel="noopener noreferrer"
                style={{ color: '#1a1a1a', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Directions
              </a>
              {activity.venue.website && (
                <a href={activity.venue.website} target="_blank" rel="noopener noreferrer"
                  style={{ color: '#1a1a1a', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                  Website
                </a>
              )}
              {activity.venue.phoneNumber && (
                <a href={`tel:${activity.venue.phoneNumber}`}
                  style={{ color: '#1a1a1a', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                  Call
                </a>
              )}
            </div>

            {/* Block venue — very subtle */}
            {!blockUndo ? (
              <button
                onClick={handleBlock}
                style={{
                  marginTop: 16, background: 'none', border: 'none', padding: 0,
                  fontFamily: 'var(--font-dm), var(--font-body)',
                  fontSize: '0.76rem', color: '#ccc', cursor: 'pointer',
                }}
              >
                Don&apos;t show this place again
              </button>
            ) : (
              <div style={{
                marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 10,
                background: '#1a1a1a', color: '#fff',
                padding: '8px 16px', fontSize: '0.82rem', fontWeight: 600,
                fontFamily: 'var(--font-dm), var(--font-body)',
              }}>
                Hidden
                <button onClick={handleUndo} style={{
                  background: 'rgba(255,255,255,0.15)', border: 'none',
                  padding: '3px 12px', color: '#fff',
                  fontFamily: 'var(--font-dm), var(--font-body)',
                  fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
                }}>
                  Undo
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Event link ── */}
        {activity.sourceUrl && (
          <a
            href={activity.sourceUrl}
            target="_blank" rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              fontFamily: 'var(--font-dm), var(--font-body)',
              fontWeight: 600, fontSize: '0.9rem',
              color: '#1a1a1a', textDecoration: 'underline',
              textUnderlineOffset: 3,
              marginBottom: 28,
            }}
          >
            View event details ↗
          </a>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            ACTIONS — bold, full-width, high contrast
            ═══════════════════════════════════════════════════════════════════════ */}
        <div style={{ marginTop: 8, paddingBottom: 16 }}>
          <button
            onClick={onAccept}
            style={{
              width: '100%', padding: '18px 0',
              background: '#1a1a1a', border: 'none',
              fontFamily: 'var(--font-space), var(--font-display)',
              fontWeight: 700, fontSize: '1.05rem',
              color: '#fff', cursor: 'pointer',
              letterSpacing: '-0.01em',
              transition: 'background 0.15s',
            }}
          >
            Let&apos;s do this
          </button>
          <button
            onClick={onNext}
            style={{
              width: '100%', padding: '16px 0',
              marginTop: 2,
              background: '#f5f5f5', border: 'none',
              fontFamily: 'var(--font-space), var(--font-display)',
              fontWeight: 600, fontSize: '0.9rem',
              color: '#888', cursor: 'pointer',
              letterSpacing: '-0.01em',
              transition: 'background 0.15s',
            }}
          >
            Show me another
          </button>
        </div>
      </div>
    </div>
  );
}
