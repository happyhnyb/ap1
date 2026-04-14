/**
 * PlatformHeroStrip — server component
 *
 * Fetches live Agmarknet data and renders a scrolling price strip
 * for the homepage hero. Falls back to representative static prices
 * if the data feed is unavailable.
 */

import { getRecords } from '@/lib/mandi/engine';

const STATIC_FALLBACK = [
  { label: 'Wheat',   price: '₹2,240', change: '+2.1%', up: true  },
  { label: 'Onion',   price: '₹1,840', change: '-0.8%', up: false },
  { label: 'Tomato',  price: '₹3,120', change: '+5.4%', up: true  },
  { label: 'Soybean', price: '₹4,580', change: '-1.2%', up: false },
  { label: 'Cotton',  price: '₹6,850', change: '+0.6%', up: true  },
  { label: 'Rice',    price: '₹2,180', change: '-0.3%', up: false },
  { label: 'Maize',   price: '₹1,920', change: '+1.8%', up: true  },
  { label: 'Potato',  price: '₹1,240', change: '-2.1%', up: false },
];

const PREFERRED = [
  { label: 'Wheat',   terms: ['wheat']                  },
  { label: 'Rice',    terms: ['rice', 'paddy', 'basmati'] },
  { label: 'Onion',   terms: ['onion']                  },
  { label: 'Tomato',  terms: ['tomato']                 },
  { label: 'Soybean', terms: ['soyabean', 'soybean']    },
  { label: 'Cotton',  terms: ['cotton']                 },
  { label: 'Maize',   terms: ['maize', 'corn']          },
  { label: 'Potato',  terms: ['potato']                 },
];

function slug(s: string) { return s.trim().toLowerCase(); }
function fmtPrice(n: number) {
  return '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

type Chip = { label: string; price: string; change: string; up: boolean };

async function buildChips(): Promise<{ chips: Chip[]; live: boolean }> {
  try {
    const { records, apiConfigured } = await getRecords();
    if (!apiConfigured || !records.length) return { chips: STATIC_FALLBACK, live: false };

    const chips: Chip[] = [];

    for (const { label, terms } of PREFERRED) {
      const matching = records.filter((r) =>
        terms.some((t) => slug(r.commodity).includes(t))
      );
      if (!matching.length) continue;

      const byDate = new Map<string, typeof matching>();
      for (const r of matching) {
        const d = r.arrival_date || '';
        byDate.set(d, [...(byDate.get(d) ?? []), r]);
      }
      const sorted = [...byDate.keys()].filter(Boolean).sort().reverse();
      const latest   = sorted[0];
      const previous = sorted[1];

      const latestRows   = (byDate.get(latest)   ?? []).filter((r) => typeof r.modal_price === 'number');
      const previousRows = (byDate.get(previous) ?? []).filter((r) => typeof r.modal_price === 'number');

      if (!latestRows.length) continue;

      const avg  = (rows: typeof latestRows) =>
        rows.reduce((s, r) => s + (r.modal_price as number), 0) / rows.length;

      const lp = avg(latestRows);
      const pp = previousRows.length ? avg(previousRows) : null;

      const changePct = pp ? ((lp - pp) / pp) * 100 : null;

      chips.push({
        label,
        price: fmtPrice(lp),
        change: changePct != null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%` : '—',
        up: changePct == null || changePct >= 0,
      });
    }

    return chips.length >= 3
      ? { chips, live: true }
      : { chips: STATIC_FALLBACK, live: false };
  } catch {
    return { chips: STATIC_FALLBACK, live: false };
  }
}

export async function PlatformHeroStrip() {
  const { chips, live } = await buildChips();
  // Duplicate for seamless CSS animation loop
  const doubled = [...chips, ...chips];

  return (
    <div className="platform-price-strip">
      <div className="platform-price-strip-label">
        {live ? '● LIVE' : 'MANDIS'}
      </div>
      <div className="platform-price-strip-track">
        {doubled.map((chip, i) => (
          <div key={i} className="platform-price-chip">
            <span className="platform-price-chip-label">{chip.label}</span>
            <span className="platform-price-chip-price">{chip.price}</span>
            <span className={`platform-price-chip-change ${chip.up ? 'up' : 'dn'}`}>
              {chip.change}
            </span>
            {i < doubled.length - 1 && (
              <span style={{ color: 'var(--border2)', margin: '0 4px' }}>·</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
