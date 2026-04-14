import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictor } from '@/lib/auth/entitlement';
import { getHistoricalRecords, filterRecords, filtersFromQuery } from '@/lib/mandi/engine';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!canAccessPredictor(session)) {
    return NextResponse.json({ error: 'Premium access required.' }, { status: 403 });
  }

  const q: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => { q[k] = v; });

  const filters = filtersFromQuery(q);
  const { records } = await getHistoricalRecords(filters);
  const filtered = filterRecords(records, filters);

  // Group by market — return per-market prices for the bar chart
  const marketMap = new Map<string, { modal: number[]; min: number[]; max: number[]; state: string; district: string }>();
  for (const r of filtered) {
    const key = r.market || 'Unknown';
    const ex = marketMap.get(key) ?? { modal: [], min: [], max: [], state: r.state, district: r.district };
    if (typeof r.modal_price === 'number') ex.modal.push(r.modal_price);
    if (typeof r.min_price   === 'number') ex.min.push(r.min_price);
    if (typeof r.max_price   === 'number') ex.max.push(r.max_price);
    marketMap.set(key, ex);
  }

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;

  const markets = [...marketMap.entries()]
    .map(([market, v]) => ({
      market,
      state:       v.state,
      district:    v.district,
      modal_price: avg(v.modal),
      min_price:   avg(v.min),
      max_price:   avg(v.max),
    }))
    .filter((m) => m.modal_price !== null)
    .sort((a, b) => (b.modal_price ?? 0) - (a.modal_price ?? 0))
    .slice(0, 30); // top 30 markets

  return NextResponse.json(markets);
}
