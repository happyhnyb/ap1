import Image from 'next/image';

const icons: Record<string, string> = {
  crops: '🌾', agritech: '🛰️', dairy: '🐄', wheat: '🌿', organic: '🌱',
  locust: '🦗', water: '💧', tomato: '🍅', fpo: '🤝', research: '🔬',
  cotton: '☁️', markets: '📊', policy: '📋', livestock: '🐄', climate: '🌦️',
  trade: '🌐', alerts: '⚠️',
};

interface Props {
  label: string;
  src?: string | null;
  className?: string;
  style?: React.CSSProperties;
}

export function PostThumb({ label, src, className = 'post-thumb post-thumb-card', style }: Props) {
  if (src) {
    return (
      <div className={className} style={{ position: 'relative', overflow: 'hidden', fontSize: 0, ...style }}>
        <Image
          src={src}
          alt={label}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          style={{ objectFit: 'cover' }}
          unoptimized={src.startsWith('/')}
        />
      </div>
    );
  }
  return (
    <div className={className} style={{ backgroundImage: 'linear-gradient(135deg,#0e1f0c 0%,#1a3015 100%)', ...style }}>
      {icons[label?.toLowerCase()] ?? '📰'}
    </div>
  );
}
