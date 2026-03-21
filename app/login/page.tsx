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
      <div className="card animate-fade-in" style={{ padding: '32px 28px', textAlign: 'center' }}>
        <div
          style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'var(--color-green-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, marginBottom: 8 }}>
          Check your inbox
        </h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          We sent a sign-in link to <strong>{email}</strong>. It expires in 15 minutes.
        </p>
        <button className="btn-ghost" style={{ marginTop: 24 }} onClick={() => { setStatus('idle'); setEmail(''); }}>
          Try a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card animate-fade-in" style={{ padding: '28px 24px' }}>
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
          ? <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Sending…</>
          : 'Send sign-in link'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
      {/* Hero */}
      <div
        style={{
          background: 'linear-gradient(150deg, #FF7A28 0%, #F97316 55%, #F4600E 100%)',
          padding: '64px 24px 88px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 64, height: 64,
            background: 'rgba(255,255,255,0.2)',
            borderRadius: 18,
            marginBottom: 20,
            backdropFilter: 'blur(8px)',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="3 11 22 2 13 21 11 13 3 11"/>
          </svg>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
          Family Adventures
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1rem', margin: 0, fontWeight: 500 }}>
          Activity ideas for parents &amp; kids
        </p>
      </div>

      {/* Form */}
      <div style={{ flex: 1, padding: '0 20px 40px', marginTop: -36, maxWidth: 440, width: '100%', margin: '-36px auto 0' }}>
        <Suspense fallback={<div className="card" style={{ padding: 32, textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}>
          <LoginForm />
        </Suspense>
        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-faint)', marginTop: 20 }}>
          Invite only · No password · Magic link sent to your email
        </p>
      </div>
    </div>
  );
}
