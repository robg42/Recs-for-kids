'use client';

import type { Activity, RejectionReason } from '@/types';

interface Props {
  activity: Activity;
  onConfirm: (reason: RejectionReason) => void;
  onCancel: () => void;
}

const REASONS: { value: RejectionReason; label: string; emoji: string }[] = [
  { value: 'not_today', label: 'Not feeling it today', emoji: '😴' },
  { value: 'too_expensive', label: 'Too expensive', emoji: '💸' },
  { value: 'too_much_effort', label: 'Too much effort', emoji: '😮‍💨' },
  { value: 'not_interested', label: 'Not our thing', emoji: '🙅' },
];

export default function FeedbackModal({ activity, onConfirm, onCancel }: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        padding: '0 0 max(16px, env(safe-area-inset-bottom))',
      }}
      onClick={onCancel}
    >
      <div
        className="animate-slide-up"
        style={{
          background: 'var(--color-bg-card)',
          borderRadius: '24px 24px 0 0',
          padding: '24px 20px',
          width: '100%',
          maxWidth: 480,
          margin: '0 auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div
          style={{
            width: 40,
            height: 4,
            background: 'var(--color-border)',
            borderRadius: 2,
            margin: '0 auto 20px',
          }}
        />

        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.1rem',
            marginBottom: 6,
            textAlign: 'center',
          }}
        >
          Skip &ldquo;{activity.title}&rdquo;?
        </h3>
        <p
          style={{
            color: 'var(--color-text-muted)',
            fontSize: '0.875rem',
            textAlign: 'center',
            marginBottom: 20,
          }}
        >
          Your feedback helps us improve suggestions
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {REASONS.map((r) => (
            <button
              key={r.value}
              onClick={() => onConfirm(r.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 16px',
                background: 'var(--color-bg)',
                border: '2px solid var(--color-border)',
                borderRadius: 'var(--radius-button)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.15s, background 0.15s',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '0.95rem',
                color: 'var(--color-text)',
              }}
            >
              <span style={{ fontSize: 22 }}>{r.emoji}</span>
              {r.label}
            </button>
          ))}
        </div>

        <button className="btn-ghost" style={{ width: '100%', marginTop: 12 }} onClick={onCancel}>
          Actually, let me reconsider
        </button>
      </div>
    </div>
  );
}
