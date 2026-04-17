'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="container section">
      <div className="card-elevated" style={{ padding: 28, maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
        <h1 className="serif" style={{ fontSize: 'clamp(28px,4vw,38px)', marginBottom: 12 }}>
          Something went wrong
        </h1>
        <p style={{ color: 'var(--muted)', lineHeight: 1.7, marginBottom: 20 }}>
          We hit an unexpected error while loading this page. Please try again. If the issue continues, contact KYC support.
        </p>
        {error.digest && (
          <p style={{ color: 'var(--dim)', fontSize: 12, marginBottom: 20 }}>
            Reference: {error.digest}
          </p>
        )}
        <button className="btn btn-primary" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </main>
  );
}
