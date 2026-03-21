'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function LoginPage() {
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

      if (!res.ok) {
        setStatus('error');
        setMessage(data.error ?? 'Something went wrong');
        return;
      }

      setStatus('sent');
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'var(--color-bg)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🗺️</div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2rem',
            fontWeight: 800,
            margin: '0 0 8px',
            color: 'var(--color-text)',
          }}
        >
          Family Adventures
        </h1>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 40, fontSize: '1rem' }}>
          Fun activity ideas for parents &amp; kids
        </p>

        {status === 'sent' ? (
          <div
            className="card animate-fade-in"
            style={{ padding: '32px 24px', textAlign: 'center' }}
          >
            <div style={{ fontSize: 40, marginBottom: 16 }}>📬</div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.25rem',
                marginBottom: 8,
              }}
            >
              Check your inbox
            </h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
              If your email is on the list, we&apos;ve sent you a sign-in link. It expires in 15
              minutes.
            </p>
            <button
              className="btn-ghost"
              style={{ marginTop: 24 }}
              onClick={() => {
                setStatus('idle');
                setEmail('');
              }}
            >
              Try a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card" style={{ padding: '32px 24px' }}>
            <label className="field-label" htmlFor="email" style={{ textAlign: 'left', display: 'block' }}>
              Email address
            </label>
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
              <p
                style={{
                  color: '#DC2626',
                  fontSize: '0.875rem',
                  marginBottom: 16,
                  textAlign: 'left',
                }}
              >
                {message}
              </p>
            )}

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%' }}
              disabled={status === 'loading' || !email}
            >
              {status === 'loading' ? (
                <>
                  <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                  Sending link…
                </>
              ) : (
                'Send magic link →'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
