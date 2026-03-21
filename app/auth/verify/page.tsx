// This route is handled by /api/auth/verify — this page shows a loading state
// in case JS hasn't hydrated yet when the link is clicked
export default function VerifyPage() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
      <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
        Signing you in…
      </p>
    </div>
  );
}
