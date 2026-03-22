'use client';

import { useState, useRef } from 'react';
import type { Activity } from '@/types';

interface Props {
  activity: Activity;
  onGo: (activity: Activity) => void;
  onNext: (activity: Activity) => void;
}

/**
 * ActivityCardV3 — the entire product in one component.
 *
 * Design principles:
 *  - The card sells the adventure in under 2 seconds, no tap required
 *  - "Why it works for your kids" is THE hero content, not hidden behind expand
 *  - Two actions: "Let's go" (primary) or "Next" (secondary)
 *  - Venue/logistics are pull-down detail, not top-level info
 *  - Visual identity comes from the category colour, not just photos
 */

const CAT_ACCENT: Record<string, { bg: string; fg: string; gradient: string }> = {
  playground_adventure: { bg: '#E8F5E9', fg: '#2E7D32', gradient: 'linear-gradient(135deg, #43A047 0%, #2E7D32 100%)' },
  museum_mission:       { bg: '#EDE7F6', fg: '#5E35B1', gradient: 'linear-gradient(135deg, #7E57C2 0%, #4527A0 100%)' },
  soft_play:            { bg: '#FCE4EC', fg: '#C62828', gradient: 'linear-gradient(135deg, #EF5350 0%, #C62828 100%)' },
  cheap_cinema:         { bg: '#FFF3E0', fg: '#E65100', gradient: 'linear-gradient(135deg, #FF9800 0%, #E65100 100%)' },
  nature_walk:          { bg: '#E0F2F1', fg: '#00695C', gradient: 'linear-gradient(135deg, #26A69A 0%, #00695C 100%)' },
  at_home_creative:     { bg: '#FFF8E1', fg: '#F57F17', gradient: 'linear-gradient(135deg, #FFB300 0%, #F57F17 100%)' },
  local_event:          { bg: '#E3F2FD', fg: '#1565C0', gradient: 'linear-gradient(135deg, #42A5F5 0%, #1565C0 100%)' },
};

const DEFAULT_ACCENT = { bg: '#E8F5E9', fg: '#2E7D32', gradient: 'linear-gradient(135deg, #43A047 0%, #2E7D32 100%)' };

export default function ActivityCardV3({ activity, onGo, onNext }: Props) {
  const [showDetail, setShowDetail] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [blockUndo, setBlockUndo] = useState(false);
  const [blockDone, setBlockDone] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const accent = CAT_ACCENT[activity.category] ?? DEFAULT_ACCENT;

  const imageUrl = (() => {
    if (activity.imageUrl) return `/api/photo?url=${encodeURIComponent(activity.imageUrl)}`;
    if (activity.venue?.photoName) return `/api/photo?name=${encodeURIComponent(activity.venue.photoName)}`;
    return null;
  })();
  const hasImage = !photoError && !!imageUrl;

  const cost = activity.costPerChild === 0 ? 'Free' : `£${activity.costPerChild.toFixed(0)}/child`;

  function handleNext() {
    setDismissed(true);
    setTimeout(() => onNext(activity), 350);
  }

  function handleBlock() {
    if (!activity.venue) return;
    setBlockUndo(true);
    undoTimer.current = setTimeout(() => {
      setBlockDone(true);
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
      onNext(activity);
    }, 4000);
  }

  function handleUndo() {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setBlockUndo(false);
  }

  return (
    <div
      className="animate-fade-in"
      style={{
        transform: dismissed ? 'translateX(-110%) rotate(-4deg)' : 'none',
        opacity: dismissed ? 0 : 1,
        transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease',
        pointerEvents: dismissed ? 'none' : 'auto',
      }}
    >
      <div style={{
        background: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)',
        position: 'relative',
      }}>

        {/* ── Hero zone: image or gradient ── */}
        <div style={{
          position: 'relative',
          height: hasImage ? 200 : 120,
          background: hasImage ? '#222' : accent.gradient,
          overflow: 'hidden',
        }}>
          {hasImage && imageUrl && (
            <img
              src={imageUrl}
              alt=""
              onError={() => setPhotoError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )}
          {!hasImage && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 64, opacity: 0.25 }}>{activity.emoji}</span>
            </div>
          )}
          {/* Scrim */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)',
          }} />
          {/* Title on image */}
          <div style={{ position: 'absolute', bottom: 14, left: 16, right: 16 }}>
            <h2 style={{
              margin: 0, color: '#fff',
              fontFamily: 'var(--font-display)', fontWeight: 800,
              fontSize: '1.2rem', lineHeight: 1.2,
              textShadow: '0 1px 6px rgba(0,0,0,0.4)',
            }}>
              {activity.title}
            </h2>
          </div>
        </div>

        {/* ── Quick facts strip ── */}
        <div style={{
          display: 'flex', gap: 8, padding: '10px 16px',
          borderBottom: '1px solid #f0f0f0',
          flexWrap: 'wrap',
        }}>
          <Tag accent={accent.fg}>{cost}</Tag>
          <Tag>{activity.duration}</Tag>
          <Tag>{activity.energyLevel === 'low' ? 'Chill' : activity.energyLevel === 'medium' ? 'Active' : 'High energy'}</Tag>
          {activity.venue && <Tag>📍 {activity.venue.name}</Tag>}
          {activity.venue?.rating && <Tag>⭐ {activity.venue.rating.toFixed(1)}</Tag>}
          {activity.sourceUrl && <Tag accent="#E65100">Event</Tag>}
        </div>

        {/* ── WHY IT WORKS — the hero section, always visible ── */}
        <div style={{ padding: '14px 16px 12px' }}>
          <p style={{
            margin: '0 0 10px',
            fontFamily: 'var(--font-display)', fontWeight: 800,
            fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em',
            color: accent.fg,
          }}>
            Why your kids will love it
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activity.whyItWorks.map((w, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <span style={{
                  background: accent.bg,
                  color: accent.fg,
                  fontFamily: 'var(--font-display)', fontWeight: 800,
                  fontSize: '0.7rem',
                  padding: '3px 8px',
                  borderRadius: 6,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  marginTop: 1,
                }}>
                  {w.name}
                </span>
                <span style={{
                  fontSize: '0.84rem', lineHeight: 1.45,
                  color: '#444',
                }}>
                  {w.reason}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Detail toggle ── */}
        <button
          onClick={() => setShowDetail(v => !v)}
          style={{
            width: '100%', border: 'none', borderTop: '1px solid #f0f0f0',
            background: showDetail ? '#fafafa' : 'transparent',
            padding: '10px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: '0.76rem', color: '#888',
          }}
        >
          {showDetail ? 'Hide details' : 'Plan, venue & more'}
          <span style={{
            transform: showDetail ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s', fontSize: 12,
          }}>▼</span>
        </button>

        {/* ── Expanded details ── */}
        {showDetail && (
          <div className="animate-fade-in" style={{ padding: '0 16px 16px' }}>

            {/* Plan */}
            <SectionLabel>The plan</SectionLabel>
            <ol style={{ margin: '0 0 18px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {activity.plan.map((step, i) => (
                <li key={i} style={{ fontSize: '0.84rem', lineHeight: 1.5, color: '#444' }}>{step}</li>
              ))}
            </ol>

            {/* Venue card */}
            {activity.venue && (
              <div style={{
                background: '#f8f8f8', borderRadius: 10, padding: '12px 14px', marginBottom: 14,
              }}>
                <a
                  href={`https://www.google.com/maps/search/?${new URLSearchParams({
                    api: '1',
                    query: `${activity.venue.name} ${activity.venue.address}`,
                    query_place_id: activity.venue.placeId,
                  })}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: 'var(--font-display)', fontWeight: 700,
                    fontSize: '0.88rem', color: accent.fg, textDecoration: 'none',
                  }}
                >
                  📍 {activity.venue.name} ↗
                </a>
                <div style={{ fontSize: '0.78rem', color: '#777', marginTop: 3 }}>
                  {activity.venue.address}
                </div>
                {activity.venue.openNow === false && (
                  <div style={{ fontSize: '0.75rem', color: '#c62828', marginTop: 3, fontWeight: 600 }}>
                    May be closed right now
                  </div>
                )}
                {activity.venue.openingHours && activity.venue.openingHours.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ fontSize: '0.72rem', color: '#999', cursor: 'pointer' }}>Opening hours</summary>
                    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {activity.venue.openingHours.map((h, i) => (
                        <div key={i} style={{ fontSize: '0.72rem', color: '#888' }}>{h}</div>
                      ))}
                    </div>
                  </details>
                )}
                <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
                  {activity.venue.website && (
                    <a href={activity.venue.website} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '0.78rem', color: accent.fg, fontWeight: 600, textDecoration: 'none' }}>
                      Website ↗
                    </a>
                  )}
                  {activity.venue.phoneNumber && (
                    <a href={`tel:${activity.venue.phoneNumber}`}
                      style={{ fontSize: '0.78rem', color: accent.fg, fontWeight: 600, textDecoration: 'none' }}>
                      Call {activity.venue.phoneNumber}
                    </a>
                  )}
                </div>
                <button
                  onClick={handleBlock}
                  style={{
                    marginTop: 10, background: 'none', border: 'none', padding: 0,
                    fontSize: '0.72rem', color: '#bbb', cursor: 'pointer',
                    textDecoration: 'underline', textDecorationStyle: 'dotted',
                  }}
                >
                  Hide this place from future suggestions
                </button>
              </div>
            )}

            {/* Event link */}
            {activity.sourceUrl && (
              <a
                href={activity.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: '#E65100', color: '#fff', borderRadius: 8,
                  padding: '10px 18px', fontFamily: 'var(--font-display)',
                  fontWeight: 700, fontSize: '0.84rem', textDecoration: 'none',
                  marginBottom: 14,
                }}
              >
                View event details ↗
              </a>
            )}
          </div>
        )}

        {/* ── Action bar ── */}
        <div style={{
          display: 'flex', gap: 10, padding: '12px 16px 16px',
          borderTop: '1px solid #f0f0f0',
        }}>
          <button
            onClick={handleNext}
            style={{
              flex: 1, padding: '14px 0',
              background: '#f5f5f5', border: 'none', borderRadius: 12,
              fontFamily: 'var(--font-display)', fontWeight: 700,
              fontSize: '0.88rem', color: '#777', cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            Next
          </button>
          <button
            onClick={() => onGo(activity)}
            style={{
              flex: 2, padding: '14px 0',
              background: accent.fg, border: 'none', borderRadius: 12,
              fontFamily: 'var(--font-display)', fontWeight: 800,
              fontSize: '0.92rem', color: '#fff', cursor: 'pointer',
              boxShadow: `0 2px 8px ${accent.fg}40`,
              transition: 'transform 0.1s, box-shadow 0.15s',
            }}
          >
            Let&apos;s go!
          </button>
        </div>

        {/* Block undo toast */}
        {blockUndo && (
          <div className="animate-fade-in" style={{
            position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)',
            background: '#333', color: '#fff', borderRadius: 100,
            padding: '8px 16px', fontSize: '0.78rem', fontWeight: 600,
            fontFamily: 'var(--font-display)', display: 'flex', gap: 10,
            alignItems: 'center', zIndex: 10, whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          }}>
            Place hidden
            <button onClick={handleUndo} style={{
              background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 4,
              padding: '2px 10px', color: '#fff', fontFamily: 'var(--font-display)',
              fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer',
            }}>
              Undo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function Tag({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <span style={{
      fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px',
      borderRadius: 6, fontFamily: 'var(--font-display)',
      background: accent ? `${accent}12` : '#f5f5f5',
      color: accent ?? '#888',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: 'var(--font-display)', fontSize: '0.65rem', fontWeight: 700,
      color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.08em',
      margin: '0 0 8px',
    }}>
      {children}
    </p>
  );
}
