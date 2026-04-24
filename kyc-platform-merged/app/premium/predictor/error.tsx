'use client';

export default function PredictorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="pr-shell">
      <div className="card-elevated" style={{ padding: 24, display: 'grid', gap: 14 }}>
        <div className="unwind-badge">Powered by Unwind AI</div>
        <div style={{ fontFamily: 'Lora,serif', fontSize: 24, fontWeight: 700 }}>Predictor temporarily unavailable</div>
        <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.7 }}>
          We hit an unexpected error while loading this forecast view. Please retry once, and if it keeps happening we can keep working from cached/sample data.
        </p>
        <div className="notice notice-gold" style={{ marginBottom: 0 }}>
          {error.message || 'Unexpected predictor error'}
        </div>
        <button type="button" className="btn btn-gold" onClick={reset} style={{ width: 'fit-content' }}>
          Retry
        </button>
      </div>
    </main>
  );
}
