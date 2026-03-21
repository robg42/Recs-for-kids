'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';

interface User {
  id: number;
  email: string;
  invitedBy: string | null;
  createdAt: string;
  isAdmin: boolean;
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addSuccess, setAddSuccess] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (res.status === 401) { router.push('/login'); return; }
      if (res.status === 403) { setForbidden(true); setLoading(false); return; }
      const data = await res.json();
      setUsers(data.users ?? []);
      setForbidden(false);
    } catch {
      // network error
    } finally {
      setUsersLoading(false);
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

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
      if (!res.ok) { setAddError(data.error ?? 'Failed to add user'); return; }
      setAddSuccess(`Added ${newEmail}`);
      setInviteLink(`${window.location.origin}/login`);
      setNewEmail('');
      await loadUsers();
      setTimeout(() => { setAddSuccess(''); setInviteLink(''); }, 8000);
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

  async function handleToggleAdmin(id: number, currentlyAdmin: boolean) {
    const action = currentlyAdmin ? 'remove admin from' : 'make admin';
    const user = users.find(u => u.id === id);
    if (!confirm(`${action} ${user?.email}?`)) return;
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isAdmin: !currentlyAdmin }),
    });
    if (res.ok) await loadUsers();
  }

  const PROTECTED_EMAIL = 'mail@robgregg.com';
  const totalUsers = users.length;
  const adminCount = users.filter(u => u.isAdmin).length;

  if (loading) {
    return (
      <>
        <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
          <div className="spinner" />
        </div>
        <Navigation />
      </>
    );
  }

  if (forbidden) {
    return (
      <>
        <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'var(--color-bg)' }}>
          <div style={{ textAlign: 'center', maxWidth: 320 }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🔒</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 800, marginBottom: 8 }}>Access denied</h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>You need admin access to view this page. Ask an admin to grant you access.</p>
          </div>
        </div>
        <Navigation />
      </>
    );
  }

  return (
    <>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '32px 16px 100px', minHeight: '100dvh', background: 'var(--color-bg)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>
              🔐 Admin
            </h1>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: '4px 0 0' }}>
              Family Adventures dashboard
            </p>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
          {[
            { label: 'Total users', value: totalUsers, color: 'var(--color-orange)' },
            { label: 'Admins', value: adminCount, color: 'var(--color-purple)' },
            { label: 'This week', value: users.filter(u => Date.now() - new Date(u.createdAt).getTime() < 7 * 864e5).length, color: 'var(--color-green)' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Add user */}
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, marginBottom: 16 }}>
            Invite someone
          </h2>
          <form onSubmit={handleAddUser} className="card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="email"
                className="text-input"
                placeholder="email@example.com"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                required
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn-primary" disabled={addLoading || !newEmail} style={{ flexShrink: 0, padding: '14px 20px' }}>
                {addLoading ? '…' : 'Add'}
              </button>
            </div>
            {addError && <p style={{ color: '#DC2626', fontSize: '0.875rem', marginTop: 10 }}>{addError}</p>}
            {addSuccess && (
              <div style={{ background: 'var(--color-green-light)', borderRadius: 10, padding: '10px 14px', marginTop: 10, fontSize: '0.875rem', color: 'var(--color-green)', fontWeight: 600 }}>
                ✅ {addSuccess}
                {inviteLink && (
                  <div style={{ marginTop: 6, fontWeight: 400, color: 'var(--color-text-muted)' }}>
                    Ask them to sign in at: <strong>{inviteLink}</strong>
                  </div>
                )}
              </div>
            )}
          </form>
        </section>

        {/* Users list */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
              All users ({totalUsers})
            </h2>
            <button className="btn-ghost" onClick={loadUsers} style={{ fontSize: '0.8rem' }}>
              {usersLoading ? '…' : '↻ Refresh'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {users.map(u => {
              const isProtected = u.email.toLowerCase() === PROTECTED_EMAIL;
              return (
                <div key={u.id} className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, background: u.isAdmin ? 'var(--color-purple-light)' : 'var(--color-orange-light)', borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                    {u.isAdmin ? '👑' : '👤'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.email}
                      </span>
                      {u.isAdmin && (
                        <span style={{ background: 'var(--color-purple-light)', color: 'var(--color-purple)', fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, fontFamily: 'var(--font-display)', flexShrink: 0 }}>
                          Admin
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-faint)' }}>
                      Added {new Date(u.createdAt).toLocaleDateString('en-GB')}
                      {u.invitedBy && u.invitedBy !== 'system' ? ` by ${u.invitedBy}` : ''}
                      {u.invitedBy === 'system' ? ' · seed user' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {!isProtected && (
                      <>
                        <button
                          className="btn-ghost"
                          onClick={() => handleToggleAdmin(u.id, u.isAdmin)}
                          style={{ fontSize: '0.75rem', color: u.isAdmin ? 'var(--color-text-muted)' : 'var(--color-purple)' }}
                        >
                          {u.isAdmin ? 'Revoke admin' : 'Make admin'}
                        </button>
                        <button
                          className="btn-ghost"
                          onClick={() => handleRemoveUser(u.id, u.email)}
                          style={{ color: '#DC2626', fontSize: '0.8rem' }}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <Navigation />
    </>
  );
}
