import Link from 'next/link';
import { getRecords } from '@/lib/mandi/engine';

type WidgetRow = {
  label: string;
  price: number;
  changePct: number | null;
  market: string;
  state: string;
};

const PREFERRED_COMMODITIES = [
  { label: 'Wheat', matches: ['wheat'] },
  { label: 'Rice', matches: ['rice', 'paddy', 'basmati'] },
  { label: 'Soybean', matches: ['soyabean', 'soybean'] },
  { label: 'Cotton', matches: ['cotton'] },
  { label: 'Tomato', matches: ['tomato'] },
  { label: 'Onion', matches: ['onion'] },
];

function slug(value: string) {
  return value.trim().toLowerCase();
}

function formatPrice(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatChange(changePct: number | null) {
  if (changePct == null || Number.isNaN(changePct)) return 'latest govt data';
  const rounded = Math.abs(changePct).toFixed(1);
  return `${changePct >= 0 ? '+' : '-'}${rounded}% vs prior day`;
}

function buildRows(records: Awaited<ReturnType<typeof getRecords>>['records']): WidgetRow[] {
  return PREFERRED_COMMODITIES.flatMap(({ label, matches }) => {
    const commodityRows = records.filter((record) => {
      const commodity = slug(record.commodity);
      return matches.some((term) => commodity.includes(term));
    });
    if (!commodityRows.length) return [];

    const byDate = new Map<string, typeof commodityRows>();
    for (const row of commodityRows) {
      const dateKey = row.arrival_date || 'unknown';
      byDate.set(dateKey, [...(byDate.get(dateKey) ?? []), row]);
    }

    const sortedDates = [...byDate.keys()].filter(Boolean).sort().reverse();
    const latestDate = sortedDates[0];
    if (!latestDate) return [];

    const latestRows = (byDate.get(latestDate) ?? []).filter((row) => typeof row.modal_price === 'number');
    if (!latestRows.length) return [];

    const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const latestPrice = avg(latestRows.map((row) => row.modal_price as number));

    const previousDate = sortedDates.find((date) => date !== latestDate);
    const previousRows = previousDate
      ? (byDate.get(previousDate) ?? []).filter((row) => typeof row.modal_price === 'number')
      : [];
    const previousPrice = previousRows.length
      ? avg(previousRows.map((row) => row.modal_price as number))
      : null;

    const referenceRow = latestRows
      .slice()
      .sort((a, b) => (b.modal_price ?? 0) - (a.modal_price ?? 0))[0];

    return [{
      label,
      price: latestPrice,
      changePct: previousPrice && previousPrice > 0
        ? ((latestPrice - previousPrice) / previousPrice) * 100
        : null,
      market: referenceRow.market || 'Multiple markets',
      state: referenceRow.state || '',
    }];
  });
}

export async function MandiWidget() {
  const { records, apiConfigured } = await getRecords();
  const rows = buildRows(records).slice(0, 6);
  const hasLiveData = apiConfigured && rows.length > 0;

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontFamily: 'Lora,serif', fontSize: 16, margin: 0 }}>Mandi Prices</h3>
        <span className={`badge ${hasLiveData ? 'badge-green' : ''}`} style={{ fontSize: 10 }}>
          {hasLiveData ? '● Govt API' : 'Data unavailable'}
        </span>
      </div>
      <div>
        {hasLiveData ? rows.map((item) => (
          <div key={item.label} className="mandi-row">
            <span style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{formatPrice(item.price)}</div>
              <div style={{ fontSize: 11, color: item.changePct == null || item.changePct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {formatChange(item.changePct)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--dim)' }}>
                {item.market}{item.state ? `, ${item.state}` : ''}
              </div>
            </div>
          </div>
        )) : (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--dim)', lineHeight: 1.6 }}>
            Live mandi data is temporarily unavailable. Connect the government data feed to show current market prices here.
          </p>
        )}
      </div>
      <Link href="/premium/predictor" className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 14, fontSize: 12 }}>
        View full predictor ⚡
      </Link>
    </div>
  );
}
