'use client';

import { useState } from 'react';
import type { Activity } from '@/types';

interface Props {
  activity: Activity;
  onAccept: (activity: Activity) => void;
  onReject: (activity: Activity) => void;
  index: number;
}

export default function ActivityCard({ activity, onAccept, onReject, index }: Props) {
  const [expanded, setExpanded] = useState(false);

  const costLabel =
    activity.costPerChild === 0
      ? 'Free'
      : `£${activity.costPerChild.toFixed(0)} per child`;

  const energyColour: Record<string, string> = {
    low: 'var(--color-green)',
    medium: 'var(--color-blue)',
    high: 'var(--color-orange)',
  };

  const categoryEmoji: Record<string, string> = {
    playground_adventure: '🛝',
    museum_mission: '🏛️',
    soft_play: '🧸',
    cheap_cinema: '🎬',
    nature_walk: '🌿',
    at_home_creative: '🎨',
    local_event: '🎡',
  };

  return (
    <div
      className="card animate-fade-in"
      style={{
        animationDelay: `${index * 80}ms`,
        overflow: 'hidden',
      }}
    >
      {/* Card header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '20px',
          display: 'flex',
          gap: 16,
          alignItems: 'flex-start',
        }}
      >
        <span
          style={{
            fontSize: 40,
            lineHeight: 1,
            flexShrink: 0,
            width: 52,
            height: 52,
            background: 'var(--color-bg)',
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {activity.emoji}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.1rem',
              fontWeight: 800,
              margin: '0 0 6px',
              lineHeight: 1.2,
              color: 'var(--color-text)',
            }}
          >
            {activity.title}
          </h3>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span
              style={{
                background: 'var(--color-green-light)',
                color: 'var(--color-green)',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 'var(--radius-pill)',
                fontFamily: 'var(--font-display)',
              }}
            >
              {costLabel}
            </span>
            <span
              style={{
                background: 'var(--color-bg)',
                color: energyColour[activity.energyLevel] ?? 'var(--color-text-muted)',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 'var(--radius-pill)',
                fontFamily: 'var(--font-display)',
                border: '1px solid var(--color-border)',
              }}
            >
              {categoryEmoji[activity.category]} {activity.duration}
            </span>
          </div>

          {activity.venue && (
            <p
              style={{
                margin: '8px 0 0',
                fontSize: '0.8rem',
                color: 'var(--color-text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              📍 {activity.venue.name}
            </p>
          )}
        </div>

        <span
          style={{
            fontSize: 20,
            color: 'var(--color-text-faint)',
            flexShrink: 0,
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(180deg)' : 'none',
          }}
        >
          ↓
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div
          style={{
            padding: '0 20px 20px',
            borderTop: '1px solid var(--color-border)',
            paddingTop: 16,
          }}
          className="animate-fade-in"
        >
          {/* Plan */}
          <h4
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.8rem',
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              margin: '0 0 10px',
            }}
          >
            The plan
          </h4>
          <ol style={{ margin: '0 0 20px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activity.plan.map((step, i) => (
              <li key={i} style={{ fontSize: '0.9rem', color: 'var(--color-text)', lineHeight: 1.4 }}>
                {step}
              </li>
            ))}
          </ol>

          {/* Why it works */}
          <h4
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.8rem',
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              margin: '0 0 10px',
            }}
          >
            Why it works
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {activity.whyItWorks.map((w, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--color-bg)',
                  borderRadius: 12,
                  padding: '10px 14px',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    color: 'var(--color-orange)',
                  }}
                >
                  {w.name} (age {w.age})
                </span>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
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
                borderRadius: 12,
                padding: '12px 14px',
                marginBottom: 20,
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <span style={{ fontSize: 18 }}>📍</span>
              <div>
                <div
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem' }}
                >
                  {activity.venue.name}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {activity.venue.address}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn-secondary"
              style={{ flex: 1 }}
              onClick={() => onReject(activity)}
            >
              Not today
            </button>
            <button
              className="btn-primary"
              style={{ flex: 2 }}
              onClick={() => onAccept(activity)}
            >
              Let&apos;s do this! 🎉
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
