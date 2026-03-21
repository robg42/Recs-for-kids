'use client';

import { useState, useEffect, useCallback } from 'react';
import Navigation from '@/components/Navigation';

interface User {
  id: number;
  email: string;
  invitedBy: string | null;
  createdAt: string;
}

type AdminView = 'login' | 'dashboard';

export default function AdminPage() {
  const [view, setView] = useState<AdminView>('login');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addSuccess, setAddSuccess] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);

  // Magic link preview (for manual invite sharing)
  const [inviteLink, setInviteLink] = useState('');

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (res.status === 401) {
        setView('login');
        return;
      }
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      // ignore
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // Try loading users on mount (in case session cookie already set)
  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users ?? []);
        setView('dashboard');
      }
    })();
  }, [loadUsers]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error ?? 'Invalid password');
        return;
      }
      await loadUsers();
      setView('dashboard');
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    setAddSuccess('');
    setAddLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? 'Failed to add user');
        return;
      }
      setAddSuccess(`Added ${newEmail}`);
      setNewEmail('');
      await loadUsers();

      // Generate an invite link the admin can share
      const appUrl = window.location.origin;
      setInviteLink(`${appUrl}/login (email: ${newEmail})`);
      setTimeout(() => {
        setAddSuccess('');
        setInviteLink('');
      }, 8000);
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRemoveUser(id: number, email: string) {
    if (!confirm(`Remove ${email}?`)) return;
    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) await loadUsers();
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setView('login');
    setPassword('');
  }

  if (view === 'login') {
    return (
      <>
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 24px 100px',
            background: 'var(--color-bg)',
          }}
        >
          <div style={{ width: '100%', maxWidth: 380 }}>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.5rem',
                fontWeight: 800,
                marginBottom: 24,
                textAlign: 'center',
              }}
            >
              🔐 Admin
            </h1>
            <form onSubmit={handleLogin} className="card" style={{ padding: '24px' }}>
              <label className="field-label" htmlFor="admin-pw">
                Admin password
              </label>
              <input
                id="admin-pw"
                type="password"
                className="text-input"
                style={{ marginBottom: 16 }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              {loginError && (
                <p style={{ color: '#DC2626', fontSize: '0.875rem', marginBottom: 16 }}>
                  {loginError}
                </p>
              )}
              <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loginLoading}>
                {loginLoading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
        <Navigation />
      </>
    );
  }

  const totalUsers = users.length;

  return (
    <>
    <div
      style={{
        maxWidth: 600,
        margin: '0 auto',
        padding: '32px 16px 100px',
        minHeight: '100dvh',
        background: 'var(--color-bg)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 32,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.75rem',
              fontWeight: 800,
              margin: 0,
            }}
          >
            🗺️ Admin
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: '4px 0 0' }}>
            Family Adventures dashboard
          </p>
        </div>
        <button className="btn-ghost" onClick={handleLogout}>
          Sign out
        </button>
      </div>

      {/* Stats bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
          marginBottom: 32,
        }}
      >
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2rem',
              fontWeight: 800,
              color: 'var(--color-orange)',
            }}
          >
            {totalUsers}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            Invited users
          </div>
        </div>
        <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2rem',
              fontWeight: 800,
              color: 'var(--color-green)',
            }}
          >
            {users.filter((u) => {
              const age = Date.now() - new Date(u.createdAt).getTime();
              return age < 7 * 24 * 60 * 60 * 1000;
            }).length}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            Added this week
          </div>
        </div>
      </div>

      {/* Add user */}
      <section style={{ marginBottom: 32 }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.1rem',
            fontWeight: 800,
            marginBottom: 16,
          }}
        >
          Invite someone
        </h2>
        <form onSubmit={handleAddUser} className="card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="email"
              className="text-input"
              placeholder="email@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              style={{ flex: 1 }}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={addLoading || !newEmail}
              style={{ flexShrink: 0, padding: '14px 20px' }}
            >
              {addLoading ? '…' : 'Add'}
            </button>
          </div>

          {addError && (
            <p style={{ color: '#DC2626', fontSize: '0.875rem', marginTop: 10 }}>{addError}</p>
          )}
          {addSuccess && (
            <div
              style={{
                background: 'var(--color-green-light)',
                borderRadius: 10,
                padding: '10px 14px',
                marginTop: 10,
                fontSize: '0.875rem',
                color: 'var(--color-green)',
                fontWeight: 600,
              }}
            >
              ✅ {addSuccess}
              {inviteLink && (
                <div style={{ marginTop: 6, fontWeight: 400, color: 'var(--color-text-muted)' }}>
                  Share this with them: <strong>{inviteLink}</strong>
                </div>
              )}
            </div>
          )}
        </form>
      </section>

      {/* Users list */}
      <section>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
            All users ({totalUsers})
          </h2>
          <button className="btn-ghost" onClick={loadUsers} style={{ fontSize: '0.8rem' }}>
            {usersLoading ? '…' : '↻ Refresh'}
          </button>
        </div>

        {users.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>No users yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {users.map((u) => (
              <div
                key={u.id}
                className="card"
                style={{
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    background: 'var(--color-orange-light)',
                    borderRadius: 999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  👤
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {u.email}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-faint)' }}>
                    Added {new Date(u.createdAt).toLocaleDateString('en-GB')}
                    {u.invitedBy && u.invitedBy !== 'system' ? ` by ${u.invitedBy}` : ''}
                    {u.invitedBy === 'system' ? ' · seed user' : ''}
                  </div>
                </div>
                {u.invitedBy !== 'system' && (
                  <button
                    className="btn-ghost"
                    onClick={() => handleRemoveUser(u.id, u.email)}
                    style={{ color: '#DC2626', fontSize: '0.8rem', flexShrink: 0 }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
    <Navigation />
    </>
  );
}
