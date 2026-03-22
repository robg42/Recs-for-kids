'use client';

import { useState, useRef } from 'react';
import type { Activity } from '@/types';

interface Props {
  activity: Activity;
  onAccept: () => void;
  onNext: () => void;
}

// Category accent colors — subtle, used for badges and small accents only
const CAT_COLORS: Record<string, { accent: string; bg: string; gradient: string }> = {
  playground_adventure: { accent: '#2E7D32', bg: '#E8F5E9', gradient: 'linear-gradient(135deg, #66BB6A 0%, #2E7D32 100%)' },
  museum_mission:       { accent: '#5E35B1', bg: '#EDE7F6', gradient: 'linear-gradient(135deg, #9575CD 0%, #4527A0 100%)' },
  soft_play:            { accent: '#C62828', bg: '#FFEBEE', gradient: 'linear-gradient(135deg, #EF5350 0%, #C62828 100%)' },
  cheap_cinema:         { accent: '#E65100', bg: '#FFF3E0', gradient: 'linear-gradient(135deg, #FFA726 0%, #E65100 100%)' },
  nature_walk:          { accent: '#00695C', bg: '#E0F2F1', gradient: 'linear-gradient(135deg, #4DB6AC 0%, #00695C 100%)' },
  at_home_creative:     { accent: '#F57F17', bg: '#FFF8E1', gradient: 'linear-gradient(135deg, #FFD54F 0%, #F57F17 100%)' },
  local_event:          { accent: '#1565C0', bg: '#E3F2FD', gradient: 'linear-gradient(135deg, #64B5F6 0%, #1565C0 100%)' },
};

const DEFAULT_COLOR = { accent: '#444', bg: '#f5f5f5', gradient: 'linear-gradient(135deg, #999 0%, #555 100%)' };

export default function ActivityView({ activity, onAccept, onNext }: Props) {
  const [photoError, setPhotoError] = useState(false);
  const [blockUndo, setBlockUndo] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cat = CAT_COLORS[activity.category] ?? DEFAULT_COLOR;

  // Photo URL resolution
  const imageUrl = (() => {
    if (activity.imageUrl) return `/api/photo?url=${encodeURIComponent(activity.imageUrl)}`;
    if (activity.venue?.photoName) return `/api/photo?name=${encodeURIComponent(activity.venue.photoName)}`;
    return null;
  })();
  const hasImage = !photoError && !!imageUrl;

  const cost = activity.costPerChild === 0 ? 'Free' : `£${activity.costPerChild.toFixed(0)}/child`;
  const energyLabel = activity.energyLevel === 'low' ? 'Chill' : activity.energyLevel === 'medium' ? 'Active' : 'High energy';

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

  return (
    <div className="animate-crossfade">
      {/* ── Hero image / fallback ── */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: hasImage ? 280 : 200,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 20,
      }}>
        {hasImage && imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            onError={() => setPhotoError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: cat.gradient,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 80, opacity: 0.2, filter: 'grayscale(20%)' }}>
              {activity.emoji}
            </span>
          </div>
        )}

        {/* Gradient scrim */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: '65%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.1) 70%, transparent 100%)',
        }} />

        {/* Title overlay */}
        <div style={{ position: 'absolute', bottom: 18, left: 20, right: 20 }}>
          <h1 style={{
            margin: 0, color: '#fff',
            fontFamily: 'var(--font-display)', fontWeight: 800,
            fontSize: '1.5rem', lineHeight: 1.15,
            textShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>
            <span style={{ marginRight: 8 }}>{activity.emoji}</span>
            {activity.title}
          </h1>
        </div>
      </div>

      {/* ── Quick facts ── */}
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap',
        marginBottom: 24,
      }}>
        <Pill accent={cat.accent}>{cost}</Pill>
        <Pill>{activity.duration}</Pill>
        <Pill>{energyLabel}</Pill>
        {activity.indoorOutdoor !== 'either' && (
          <Pill>{activity.indoorOutdoor === 'indoor' ? 'Indoor' : 'Outdoor'}</Pill>
        )}
        {activity.sourceUrl && <Pill accent="#E65100">Event</Pill>}
      </div>

      {/* ── Venue quick line ── */}
      {activity.venue && (
        <div style={{ marginBottom: 24 }}>
          <a
            href={`https://www.google.com/maps/search/?${new URLSearchParams({
              api: '1',
              query: `${activity.venue.name} ${activity.venue.address}`,
              query_place_id: activity.venue.placeId,
            })}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: '0.9rem', fontWeight: 600, color: '#444',
              textDecoration: 'none',
              fontFamily: 'var(--font-display)',
            }}
          >
            <span style={{ opacity: 0.6 }}>📍</span>
            {activity.venue.name}
            {activity.venue.rating && (
              <span style={{ color: '#999', fontWeight: 500 }}>
                · {activity.venue.rating.toFixed(1)} ★
              </span>
            )}
            <span style={{ color: cat.accent, fontSize: '0.75rem' }}>↗</span>
          </a>
        </div>
      )}

      {/* ── Perfect for your kids ── */}
      {activity.whyItWorks.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <SectionTitle color={cat.accent}>Perfect for your kids</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {activity.whyItWorks.map((w, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{
                  background: cat.bg, color: cat.accent,
                  fontFamily: 'var(--font-display)', fontWeight: 800,
                  fontSize: '0.72rem', padding: '4px 10px',
                  borderRadius: 8, whiteSpace: 'nowrap', flexShrink: 0,
                  marginTop: 2,
                }}>
                  {w.name}
                </span>
                <span style={{
                  fontSize: '0.9rem', lineHeight: 1.5,
                  color: '#444',
                }}>
                  {w.reason}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── The plan ── */}
      {activity.plan.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <SectionTitle>The plan</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activity.plan.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{
                  fontFamily: 'var(--font-display)', fontWeight: 800,
                  fontSize: '0.8rem', color: '#ccc',
                  width: 22, flexShrink: 0, textAlign: 'right',
                  marginTop: 1,
                }}>
                  {i + 1}.
                </span>
                <span style={{ fontSize: '0.9rem', lineHeight: 1.5, color: '#444' }}>
                  {step}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Venue details card ── */}
      {activity.venue && (
        <div style={{
          background: '#f8f8f8', borderRadius: 14, padding: '16px 18px',
          marginBottom: 24,
        }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: '0.92rem', color: '#333', marginBottom: 4,
          }}>
            {activity.venue.name}
          </div>
          <div style={{ fontSize: '0.82rem', color: '#888', marginBottom: 8 }}>
            {activity.venue.address}
          </div>

          {activity.venue.openNow === false && (
            <div style={{
              fontSize: '0.78rem', color: '#c62828', fontWeight: 600,
              marginBottom: 8,
            }}>
              May be closed right now
            </div>
          )}

          {activity.venue.openingHours && activity.venue.openingHours.length > 0 && (
            <details style={{ marginBottom: 10 }}>
              <summary style={{
                fontSize: '0.76rem', color: '#999', cursor: 'pointer',
                fontFamily: 'var(--font-display)', fontWeight: 600,
              }}>
                Opening hours
              </summary>
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {activity.venue.openingHours.map((h, i) => (
                  <div key={i} style={{ fontSize: '0.76rem', color: '#888' }}>{h}</div>
                ))}
              </div>
            </details>
          )}

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <a
              href={`https://www.google.com/maps/search/?${new URLSearchParams({
                api: '1',
                query: `${activity.venue.name} ${activity.venue.address}`,
                query_place_id: activity.venue.placeId,
              })}`}
              target="_blank" rel="noopener noreferrer"
              style={{
                fontSize: '0.82rem', color: cat.accent, fontWeight: 700,
                textDecoration: 'none', fontFamily: 'var(--font-display)',
              }}
            >
              Directions ↗
            </a>
            {activity.venue.website && (
              <a href={activity.venue.website} target="_blank" rel="noopener noreferrer"
                style={{
                  fontSize: '0.82rem', color: cat.accent, fontWeight: 700,
                  textDecoration: 'none', fontFamily: 'var(--font-display)',
                }}>
                Website ↗
              </a>
            )}
            {activity.venue.phoneNumber && (
              <a href={`tel:${activity.venue.phoneNumber}`}
                style={{
                  fontSize: '0.82rem', color: cat.accent, fontWeight: 700,
                  textDecoration: 'none', fontFamily: 'var(--font-display)',
                }}>
                Call
              </a>
            )}
          </div>

          {/* Block venue */}
          {!blockUndo ? (
            <button
              onClick={handleBlock}
              style={{
                marginTop: 12, background: 'none', border: 'none', padding: 0,
                fontSize: '0.72rem', color: '#ccc', cursor: 'pointer',
                textDecoration: 'underline', textDecorationStyle: 'dotted',
              }}
            >
              Hide this place from future suggestions
            </button>
          ) : (
            <div style={{
              marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#333', color: '#fff', borderRadius: 100,
              padding: '6px 14px', fontSize: '0.76rem', fontWeight: 600,
              fontFamily: 'var(--font-display)',
            }}>
              Place hidden
              <button onClick={handleUndo} style={{
                background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 4,
                padding: '2px 10px', color: '#fff', fontFamily: 'var(--font-display)',
                fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer',
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
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: '#E65100', color: '#fff', borderRadius: 12,
            padding: '12px 20px', fontFamily: 'var(--font-display)',
            fontWeight: 700, fontSize: '0.88rem', textDecoration: 'none',
            marginBottom: 24,
          }}
        >
          View event details ↗
        </a>
      )}

      {/* ── Action buttons ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        <button
          onClick={onAccept}
          style={{
            width: '100%', padding: '16px 0',
            background: '#1a1a1a', border: 'none', borderRadius: 14,
            fontFamily: 'var(--font-display)', fontWeight: 800,
            fontSize: '1rem', color: '#fff', cursor: 'pointer',
            transition: 'transform 0.1s, box-shadow 0.15s',
            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          }}
        >
          Let&apos;s do this!
        </button>
        <button
          onClick={onNext}
          style={{
            width: '100%', padding: '14px 0',
            background: 'transparent', border: '1.5px solid #e0e0e0',
            borderRadius: 14,
            fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: '0.9rem', color: '#999', cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          Show me another
        </button>
      </div>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Pill({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <span style={{
      fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px',
      borderRadius: 8, fontFamily: 'var(--font-display)',
      background: accent ? `${accent}10` : '#f0f0f0',
      color: accent ?? '#888',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function SectionTitle({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{
      fontFamily: 'var(--font-display)', fontWeight: 800,
      fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em',
      color: color ?? '#bbb',
      marginBottom: 12,
    }}>
      {children}
    </div>
  );
}
