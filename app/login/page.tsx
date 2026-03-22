'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (error === 'invalid_token') {
      setMessage('That link has expired or already been used. Please request a new one.');
      setStatus('error');
    }
    if (error === 'missing_token') {
      setMessage('Something went wrong. Please try again.');
      setStatus('error');
    }
  }, [error]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/auth/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setStatus('error'); setMessage(data.error ?? 'Something went wrong'); return; }
      setStatus('sent');
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  }

  if (status === 'sent') {
    return (
      <div
        className="animate-fade-in"
        style={{ padding: '32px 28px', textAlign: 'center', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
      >
        <div
          style={{
            width: 48, height: 48,
            background: 'var(--color-brand-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, marginBottom: 8, letterSpacing: '-0.01em' }}>
          Check your inbox
        </h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', lineHeight: 1.6 }}>
          Sign-in link sent to <strong style={{ color: 'var(--color-text)' }}>{email}</strong>.<br />
          It expires in 15 minutes.
        </p>
        <button className="btn-ghost" style={{ marginTop: 24 }} onClick={() => { setStatus('idle'); setEmail(''); }}>
          Try a different email
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-fade-in"
      style={{ padding: '28px 24px', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
    >
      <label className="field-label" htmlFor="email">Email address</label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        className="text-input"
        style={{ marginBottom: 16 }}
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={status === 'loading'}
      />
      {(status === 'error' || message) && (
        <p style={{ color: 'var(--color-rose)', fontSize: '0.85rem', marginBottom: 16 }}>{message}</p>
      )}
      <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={status === 'loading' || !email}>
        {status === 'loading'
          ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Sending</>
          : 'Send sign-in link'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
      {/* Hero — deep forest */}
      <div
        style={{
          background: 'linear-gradient(160deg, #1E2D26 0%, #2A3F35 60%, #1A2820 100%)',
          padding: '72px 24px 96px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56, height: 56,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            marginBottom: 24,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 11 22 2 13 21 11 13 3 11"/>
          </svg>
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.9rem',
            fontWeight: 800,
            color: '#F5F0E8',
            margin: '0 0 10px',
            letterSpacing: '-0.02em',
          }}
        >
          Adventure Time!
        </h1>
        <p style={{ color: 'rgba(245,240,232,0.55)', fontSize: '0.875rem', margin: 0, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Invite only
        </p>
      </div>

      {/* Form — floats over hero */}
      <div
        style={{
          flex: 1,
          padding: '0 20px 48px',
          marginTop: -40,
          maxWidth: 420,
          width: '100%',
          margin: '-40px auto 0',
        }}
      >
        <Suspense fallback={
          <div style={{ padding: 32, textAlign: 'center', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        }>
          <LoginForm />
        </Suspense>
        <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--color-text-faint)', marginTop: 20, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          No password · Magic link sent to your email
        </p>
      </div>
    </div>
  );
}
