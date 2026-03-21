'use client';

import { useState } from 'react';
import Navigation from '@/components/Navigation';
import { usePreferences } from '@/hooks/usePreferences';
import type { ActivityHistoryItem } from '@/types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function groupByDate(items: ActivityHistoryItem[]): Record<string, ActivityHistoryItem[]> {
  return items.reduce<Record<string, ActivityHistoryItem[]>>((acc, item) => {
    const label = formatDate(item.acceptedAt);
    if (!acc[label]) acc[label] = [];
    acc[label].push(item);
    return acc;
  }, {});
}

export default function HistoryPage() {
  const { prefs } = usePreferences();
  const [expanded, setExpanded] = useState<string | null>(null);

  const history = prefs?.history ?? [];
  const grouped = groupByDate(history);

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
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.75rem',
            fontWeight: 800,
            marginBottom: 8,
          }}
        >
          📖 Past Adventures
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: 32 }}>
          {history.length} adventure{history.length !== 1 ? 's' : ''} so far
        </p>

        {history.length === 0 ? (
          <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🗺️</div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.2rem',
                fontWeight: 800,
                marginBottom: 8,
              }}
            >
              No adventures yet
            </h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              When you accept an activity, it appears here. Start your first adventure today!
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {Object.entries(grouped).map(([dateLabel, items]) => (
              <div key={dateLabel}>
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.8rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--color-text-faint)',
                    marginBottom: 10,
                  }}
                >
                  {dateLabel}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {items.map((item) => {
                    const isExpanded = expanded === item.id;
                    const { activity } = item;
                    return (
                      <div key={item.id} className="card" style={{ overflow: 'hidden' }}>
                        <button
                          onClick={() => setExpanded(isExpanded ? null : item.id)}
                          style={{
                            width: '100%',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '16px',
                            display: 'flex',
                            gap: 14,
                            alignItems: 'center',
                            textAlign: 'left',
                          }}
                        >
                          <span style={{ fontSize: 32, flexShrink: 0 }}>{activity.emoji}</span>
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontFamily: 'var(--font-display)',
                                fontWeight: 800,
                                fontSize: '0.95rem',
                                marginBottom: 4,
                              }}
                            >
                              {activity.title}
                            </div>
                            <div
                              style={{
                                fontSize: '0.78rem',
                                color: 'var(--color-text-muted)',
                              }}
                            >
                              {activity.venue?.name ?? 'Home activity'} ·{' '}
                              {activity.costPerChild === 0
                                ? 'Free'
                                : `£${activity.costPerChild}`}{' '}
                              per child
                            </div>
                          </div>
                          <span
                            style={{
                              color: 'var(--color-text-faint)',
                              transition: 'transform 0.2s',
                              transform: isExpanded ? 'rotate(180deg)' : 'none',
                            }}
                          >
                            ↓
                          </span>
                        </button>

                        {isExpanded && (
                          <div
                            style={{
                              padding: '0 16px 16px',
                              borderTop: '1px solid var(--color-border)',
                              paddingTop: 14,
                            }}
                            className="animate-fade-in"
                          >
                            <ol
                              style={{
                                margin: 0,
                                paddingLeft: 20,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 5,
                              }}
                            >
                              {activity.plan.map((step, i) => (
                                <li
                                  key={i}
                                  style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}
                                >
                                  {step}
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <Navigation />
    </>
  );
}
