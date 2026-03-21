'use client';

import { useState, useEffect } from 'react';
import Navigation from '@/components/Navigation';
import { usePreferences } from '@/hooks/usePreferences';
import { loadPreferences, savePreferences } from '@/lib/storage';
import type { ChildProfile, ActivityFilters, TimeAvailable, Transport } from '@/types';

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function SettingsPage() {
  const { prefs, updateChildren, wipeHistory } = usePreferences();

  // Children
  const [children, setChildren] = useState<ChildProfile[]>([]);
  const [newName, setNewName] = useState('');
  const [newAge, setNewAge] = useState('');
  const [editingInterestsId, setEditingInterestsId] = useState<string | null>(null);

  // Default filters
  const [defaultTransport, setDefaultTransport] = useState<Transport>('car');
  const [defaultBudget, setDefaultBudget] = useState(15);
  const [defaultTime, setDefaultTime] = useState<TimeAvailable>('half-day');

  // UI state
  const [saved, setSaved] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Sync from prefs on load
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
  }

  function updateInterests(id: string, interests: string) {
    setChildren((prev) => prev.map((c) => c.id === id ? { ...c, interests } : c));
  }

  function saveAll() {
    updateChildren(children);
    // Save default filters alongside prefs
    const stored = loadPreferences();
    savePreferences({
      ...stored,
      children,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(({ defaultFilters: { transport: defaultTransport, budgetPerChild: defaultBudget, timeAvailable: defaultTime } }) as any),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleClearHistory() {
    wipeHistory();
    setShowClearConfirm(false);
  }

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
          Personalise your family adventures
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
                      onClick={() => setEditingInterestsId(editingInterestsId === c.id ? null : c.id)}
                      style={{ fontSize: '0.8rem', color: 'var(--color-orange)' }}
                    >
                      {editingInterestsId === c.id ? 'Done' : '✏️ About them'}
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
                {/* Interests display / edit */}
                {editingInterestsId === c.id ? (
                  <div style={{ marginTop: 12 }}>
                    <label className="field-label" htmlFor={`interests-${c.id}`}>
                      What is {c.name} like?
                    </label>
                    <input
                      id={`interests-${c.id}`}
                      type="text"
                      className="text-input"
                      placeholder="e.g. loves dinosaurs, gets impatient in museums, obsessed with Lego"
                      value={c.interests ?? ''}
                      onChange={(e) => updateInterests(c.id, e.target.value)}
                      maxLength={200}
                    />
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-faint)', marginTop: 4 }}>
                      Interests, quirks, what they love or hate — Claude will use this to tailor suggestions.
                    </div>
                  </div>
                ) : c.interests ? (
                  <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--color-text-muted)', paddingLeft: 52 }}>
                    🎯 {c.interests}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {/* Add child form */}
          <div className="card" style={{ padding: '16px' }}>
            <div
              style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-end' }}
            >
              <div style={{ flex: 2 }}>
                <label className="field-label" htmlFor="child-name">
                  Name
                </label>
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
                <label className="field-label" htmlFor="child-age">
                  Age
                </label>
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

        {/* ── Default filters ── */}
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
              All activity history and preferences are stored locally on this device. Nothing is
              sent to our servers.
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
        >
          {saved ? '✅ Saved!' : 'Save settings'}
        </button>
      </main>
      <Navigation />
    </>
  );
}
