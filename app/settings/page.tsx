'use client';

import { useState, useEffect } from 'react';
import Navigation from '@/components/Navigation';
import { usePreferences } from '@/hooks/usePreferences';
import { loadPreferences, savePreferences } from '@/lib/storage';
import type { ChildProfile, ActivityFilters, TimeAvailable, Transport, Gender, BlockedPlace } from '@/types';

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

const GENDER_OPTIONS: { value: Gender; label: string; emoji: string }[] = [
  { value: 'boy',   label: 'Boy',   emoji: '👦' },
  { value: 'girl',  label: 'Girl',  emoji: '👧' },
  { value: 'fluid', label: 'Fluid', emoji: '🧒' },
];

export default function SettingsPage() {
  const { prefs, updateChildren, wipeHistory } = usePreferences();

  // Children
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [newName, setNewName] = useState('');
  const [newAge, setNewAge] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Default filters
  const [defaultTransport, setDefaultTransport] = useState<Transport>('car');
  const [defaultBudget, setDefaultBudget] = useState(15);
  const [defaultTime, setDefaultTime] = useState<TimeAvailable>('half-day');

  // Session duration
  const [sessionDays, setSessionDays] = useState(30);

  // Blocked places
  const [blockedPlaces, setBlockedPlaces] = useState<BlockedPlace[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  // UI state
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Sync local prefs on load
  useEffect(() => {
    if (!prefs) return;
    setChildren(prefs.children ?? []);
    const stored = loadPreferences();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const df = (stored as any).defaultFilters as Partial<ActivityFilters> | undefined;
    if (df) {
      if (df.transport) setDefaultTransport(df.transport);
      if (df.budgetPerChild !== undefined) setDefaultBudget(df.budgetPerChild);
      if (df.timeAvailable) setDefaultTime(df.timeAvailable);
    }
  }, [prefs]);

  // Load server-side data: children (with gender), blocked places, session duration
  useEffect(() => {
    Promise.all([
      fetch('/api/profile').then((r) => r.json()).catch(() => null),
      fetch('/api/settings').then((r) => r.json()).catch(() => null),
      fetch('/api/blocked-places').then((r) => r.json()).catch(() => null),
    ]).then(([profile, settings, blocked]) => {
      if (profile && Array.isArray(profile.children)) setChildren(profile.children);
      if (settings && typeof settings.sessionDays === 'number') setSessionDays(settings.sessionDays);
      setBlockedPlaces(blocked?.places ?? []);
      setLoadingBlocked(false);
    });
  }, []);

  // ── Child helpers ──────────────────────────────────────────────────────────

  function addChild() {
    const age = parseInt(newAge, 10);
    if (!newName.trim() || isNaN(age) || age < 1 || age > 17) return;
    const updated = [...children, { id: generateId(), name: newName.trim(), age }];
    setChildren(updated);
    setNewName('');
    setNewAge('');
  }

  function removeChild(id: string) {
    setChildren((prev) => prev.filter((c) => c.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function updateChildField<K extends keyof ChildProfile>(id: string, field: K, value: ChildProfile[K]) {
    setChildren((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
  }

  // ── Blocked places ─────────────────────────────────────────────────────────

  async function unblockPlace(placeId: string) {
    setUnblocking(placeId);
    try {
      await fetch('/api/blocked-places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unblock', placeId }),
      });
      setBlockedPlaces((prev) => prev.filter((p) => p.placeId !== placeId));
    } finally {
      setUnblocking(null);
    }
  }

  // ── Save all ───────────────────────────────────────────────────────────────

  async function saveAll() {
    setSaving(true);
    try {
      // Local prefs (category weights, history, etc.)
      updateChildren(children);
      const stored = loadPreferences();
      savePreferences({
        ...stored,
        children,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ defaultFilters: { transport: defaultTransport, budgetPerChild: defaultBudget, timeAvailable: defaultTime } } as any),
      });

      // Persist children (with gender) and session duration to server in parallel
      await Promise.all([
        fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ children }),
        }),
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionDays }),
        }),
      ]);

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  function handleClearHistory() {
    wipeHistory();
    setShowClearConfirm(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

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
          ⚙️ Settings
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: 32 }}>
          Personalise your Adventure Time! experience
        </p>

        {/* ── Children ── */}
        <section style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.1rem',
              fontWeight: 800,
              marginBottom: 16,
            }}
          >
            👧 Your children
          </h2>

          {children.length === 0 && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: 16 }}>
              Add at least one child to get started.
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {children.map((c) => (
              <div key={c.id} className="card" style={{ padding: '14px 16px' }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span
                      style={{
                        width: 40,
                        height: 40,
                        background: 'var(--color-orange-light)',
                        borderRadius: 999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                      }}
                    >
                      {c.age <= 5 ? '👶' : c.age <= 10 ? '🧒' : '👦'}
                    </span>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem' }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Age {c.age}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn-ghost"
                      onClick={() => setEditingId(editingId === c.id ? null : c.id)}
                      style={{ fontSize: '0.8rem', color: 'var(--color-orange)' }}
                    >
                      {editingId === c.id ? 'Done' : '✏️ Edit'}
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={() => removeChild(c.id)}
                      style={{ color: '#DC2626', fontSize: '0.8rem' }}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {/* Expanded edit panel */}
                {editingId === c.id ? (
                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Gender */}
                    <div>
                      <span className="field-label">Gender</span>
                      <div className="toggle-group">
                        {GENDER_OPTIONS.map((g) => (
                          <button
                            key={g.value}
                            type="button"
                            className={`toggle-btn ${c.gender === g.value ? 'active' : ''}`}
                            onClick={() =>
                              updateChildField(c.id, 'gender', c.gender === g.value ? undefined : g.value)
                            }
                          >
                            {g.emoji} {g.label}
                          </button>
                        ))}
                      </div>
                      <p style={{ fontSize: '0.72rem', color: 'var(--color-text-faint)', marginTop: 4 }}>
                        Used for developmental context only — we never stereotype.
                      </p>
                    </div>

                    {/* Interests */}
                    <div>
                      <label className="field-label" htmlFor={`interests-${c.id}`}>
                        What is {c.name} like?
                      </label>
                      <input
                        id={`interests-${c.id}`}
                        type="text"
                        className="text-input"
                        placeholder="e.g. loves dinosaurs, gets impatient in museums, obsessed with Lego"
                        value={c.interests ?? ''}
                        onChange={(e) => updateChildField(c.id, 'interests', e.target.value)}
                        maxLength={200}
                      />
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-faint)', marginTop: 4 }}>
                        Interests, quirks, what they love or hate — used to tailor suggestions.
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Summary badges */
                  <div style={{ marginTop: 8, paddingLeft: 52, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {c.gender && (
                      <span
                        style={{
                          background: 'var(--color-orange-light)',
                          borderRadius: 999,
                          padding: '2px 10px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: 'var(--color-orange)',
                        }}
                      >
                        {GENDER_OPTIONS.find((g) => g.value === c.gender)?.emoji}{' '}
                        {GENDER_OPTIONS.find((g) => g.value === c.gender)?.label}
                      </span>
                    )}
                    {c.interests && (
                      <span
                        style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}
                      >
                        🎯 {c.interests}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add child form */}
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 2 }}>
                <label className="field-label" htmlFor="child-name">Name</label>
                <input
                  id="child-name"
                  type="text"
                  className="text-input"
                  placeholder="e.g. Emma"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addChild()}
                  maxLength={30}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="field-label" htmlFor="child-age">Age</label>
                <input
                  id="child-age"
                  type="number"
                  min={1}
                  max={17}
                  className="text-input"
                  placeholder="5"
                  value={newAge}
                  onChange={(e) => setNewAge(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addChild()}
                />
              </div>
            </div>
            <button
              className="btn-secondary"
              style={{ width: '100%' }}
              onClick={addChild}
              disabled={!newName.trim() || !newAge}
            >
              + Add child
            </button>
          </div>
        </section>

        {/* ── Default preferences ── */}
        <section style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.1rem',
              fontWeight: 800,
              marginBottom: 4,
            }}
          >
            🎛️ Default preferences
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: 16 }}>
            These pre-fill the discover form — you can always change them on the day.
          </p>

          <div className="card" style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Default transport */}
            <div>
              <span className="field-label">Default transport</span>
              <div className="toggle-group">
                {(
                  [
                    { value: 'car' as Transport, label: '🚗 Car' },
                    { value: 'public' as Transport, label: '🚌 Public' },
                  ]
                ).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={`toggle-btn ${defaultTransport === o.value ? 'active' : ''}`}
                    onClick={() => setDefaultTransport(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Default time */}
            <div>
              <span className="field-label">Usual session length</span>
              <div className="toggle-group">
                {(
                  [
                    { value: '1-2h' as TimeAvailable, label: '⚡ 1–2h' },
                    { value: 'half-day' as TimeAvailable, label: '☀️ Half day' },
                    { value: 'full-day' as TimeAvailable, label: '🌟 Full day' },
                  ]
                ).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={`toggle-btn ${defaultTime === o.value ? 'active' : ''}`}
                    onClick={() => setDefaultTime(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Default budget */}
            <div>
              <span className="field-label">Default budget per child</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.25rem' }}>
                  £{defaultBudget}
                </span>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={5}
                  value={defaultBudget}
                  onChange={(e) => setDefaultBudget(Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--color-orange)' }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Session duration ── */}
        <section style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.1rem',
              fontWeight: 800,
              marginBottom: 4,
            }}
          >
            🔐 Stay signed in
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: 16 }}>
            How long before you need to sign in again. Default is 30 days.
          </p>

          <div className="card" style={{ padding: '20px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.4rem', minWidth: 64 }}>
                {sessionDays}d
              </span>
              <input
                type="range"
                min={7}
                max={365}
                step={1}
                value={sessionDays}
                onChange={(e) => setSessionDays(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--color-orange)' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--color-text-faint)' }}>
              <span>7 days</span>
              <span>1 year</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 10 }}>
              Takes effect on your <em>next</em> sign-in. You&apos;re currently signed in — no action needed.
            </p>
          </div>
        </section>

        {/* ── Blocked places ── */}
        <section style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.1rem',
              fontWeight: 800,
              marginBottom: 4,
            }}
          >
            🚫 Blocked places
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: 16 }}>
            Places you&apos;ve hidden from recommendations. Unblock them here any time.
          </p>

          <div className="card" style={{ padding: '16px' }}>
            {loadingBlocked ? (
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-faint)', textAlign: 'center', padding: '12px 0' }}>
                Loading…
              </p>
            ) : blockedPlaces.length === 0 ? (
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '8px 0' }}>
                No blocked places yet. When you block a venue from a card, it appears here.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {blockedPlaces.map((p) => (
                  <div
                    key={p.placeId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '10px 12px',
                      background: 'var(--color-bg-subtle, #F9F9F9)',
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        📍 {p.placeName}
                      </div>
                      {p.address && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.address}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => unblockPlace(p.placeId)}
                      disabled={unblocking === p.placeId}
                      style={{
                        background: 'transparent',
                        border: '1.5px solid var(--color-orange)',
                        color: 'var(--color-orange)',
                        borderRadius: 8,
                        padding: '6px 12px',
                        fontSize: '0.8rem',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        cursor: unblocking === p.placeId ? 'default' : 'pointer',
                        opacity: unblocking === p.placeId ? 0.5 : 1,
                        flexShrink: 0,
                      }}
                    >
                      {unblocking === p.placeId ? '…' : 'Unblock'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Data & privacy ── */}
        <section style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.1rem',
              fontWeight: 800,
              marginBottom: 16,
            }}
          >
            🗂️ Your data
          </h2>
          <div className="card" style={{ padding: '16px' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>
              Your preferences and activity history are private to your account and stored securely.
            </p>

            {showClearConfirm ? (
              <div
                style={{
                  background: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  borderRadius: 12,
                  padding: '14px',
                }}
              >
                <p
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    color: '#DC2626',
                    marginBottom: 12,
                    fontSize: '0.9rem',
                  }}
                >
                  Clear all history and reset preferences?
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn-ghost" onClick={() => setShowClearConfirm(false)}>
                    Cancel
                  </button>
                  <button
                    onClick={handleClearHistory}
                    style={{
                      background: '#DC2626',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 10,
                      padding: '10px 18px',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Yes, clear everything
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                style={{
                  background: 'transparent',
                  border: '2px solid #FCA5A5',
                  color: '#DC2626',
                  borderRadius: 'var(--radius-button)',
                  padding: '12px 20px',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  width: '100%',
                }}
              >
                🗑️ Clear history &amp; reset
              </button>
            )}
          </div>
        </section>

        {/* Save button */}
        <button
          className="btn-primary"
          style={{ width: '100%' }}
          onClick={saveAll}
          disabled={saving}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save settings'}
        </button>

        {/* Sign out */}
        <form action="/api/auth/logout" method="POST" style={{ marginTop: 12 }}>
          <button
            type="submit"
            onClick={() => {
              try {
                ['recs-for-kids-prefs', 'recs-for-kids-filters', 'recs-for-kids-results-cache'].forEach(
                  (k) => localStorage.removeItem(k)
                );
              } catch { /* localStorage unavailable */ }
            }}
            style={{
              width: '100%',
              background: 'transparent',
              border: '1.5px solid var(--color-border)',
              color: 'var(--color-text-muted)',
              borderRadius: 'var(--radius-button)',
              padding: '12px 20px',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Sign out
          </button>
        </form>
      </main>
      <Navigation />
    </>
  );
}
