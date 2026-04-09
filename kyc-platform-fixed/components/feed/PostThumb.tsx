const icons: Record<string, string> = {
  crops: '🌾', agritech: '🛰️', dairy: '🐄', wheat: '🌿', organic: '🌱',
  locust: '🦗', water: '💧', tomato: '🍅', fpo: '🤝', research: '🔬',
  cotton: '☁️', markets: '📊', policy: '📋', livestock: '🐄', climate: '🌦️',
  trade: '🌐', alerts: '⚠️',
};

export function PostThumb({ label, className = 'post-thumb post-thumb-card', style }: { label: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={className} style={{ backgroundImage: 'linear-gradient(135deg,#0e1f0c 0%,#1a3015 100%)', ...style }}>
      {icons[label?.toLowerCase()] ?? '📰'}
    </div>
  );
}
