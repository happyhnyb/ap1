export default function PredictorLoading() {
  return (
    <main className="pr-shell">
      <div className="card-elevated" style={{ padding: 24, display: 'grid', gap: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>
          Predictor
        </div>
        <div style={{ fontFamily: 'Lora,serif', fontSize: 26, fontWeight: 700 }}>Loading forecast workspace…</div>
        <div style={{ height: 12, width: '78%', borderRadius: 999, background: 'rgba(255,255,255,.08)' }} />
        <div style={{ height: 12, width: '58%', borderRadius: 999, background: 'rgba(255,255,255,.06)' }} />
      </div>
    </main>
  );
}
