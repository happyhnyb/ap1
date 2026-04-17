import { PREDICTOR_DISCLAIMER } from '@/lib/product/predictor';

export function PredictorDisclaimer({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <div
      className="notice notice-yellow"
      style={{
        padding: compact ? '10px 12px' : '14px 16px',
        fontSize: compact ? 12 : 13,
        lineHeight: 1.6,
      }}
      role="note"
      aria-label="Important disclaimer"
    >
      <strong style={{ display: 'block', marginBottom: 4 }}>Important disclaimer</strong>
      {PREDICTOR_DISCLAIMER}
    </div>
  );
}
