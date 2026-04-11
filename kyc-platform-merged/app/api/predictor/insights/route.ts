import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictor } from '@/lib/auth/entitlement';
import { getRecords, filterRecords, buildHistory, holtForecast, filtersFromQuery } from '@/lib/mandi/engine';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!canAccessPredictor(session)) {
    return NextResponse.json({ error: 'Premium access required.' }, { status: 403 });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured.' }, { status: 503 });
  }

  const q: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => { q[k] = v; });
  const filters = filtersFromQuery(q);

  try {
    const { records } = await getRecords();
    const filtered = filterRecords(records, filters);
    const history  = buildHistory(filtered);
    const prices   = history
      .filter((h) => typeof h.avg_modal_price === 'number')
      .map((h) => h.avg_modal_price as number);

    if (prices.length < 7) {
      return NextResponse.json({ error: 'Insufficient data for analysis.' }, { status: 422 });
    }

    const forecastResult = holtForecast(prices, 14);
    if (!forecastResult) {
      return NextResponse.json({ error: 'Could not compute forecast.' }, { status: 422 });
    }

    const histSummary  = history.slice(-30).map((h) => `${h.arrival_date}: ₹${h.avg_modal_price ?? '–'}/qtl`).join(' | ');
    const fcastSummary = forecastResult.forecast.slice(0, 7).map((f) => `${f.date}: ₹${f.price} (${f.lower}–${f.upper})`).join(' | ');

    const prompt = `You are a senior commodity analyst for Indian agricultural markets.
Commodity: ${filters.commodity || 'All'}  State: ${filters.state || 'All India'}  Market: ${filters.market || 'All'}
Historical: ${histSummary}
Forecast (α=${forecastResult.alpha}, β=${forecastResult.beta}): ${fcastSummary}
Trend: ${forecastResult.direction} (${forecastResult.trend_pct > 0 ? '+' : ''}${forecastResult.trend_pct}%)  MAPE: ${forecastResult.mape}%

Respond ONLY with JSON:
{"outlook":"<2-3 sentences>","drivers":["<d1>","<d2>","<d3>"],"risks":["<r1>","<r2>"],"signal":"Buy"|"Hold"|"Wait","signal_reason":"<1 sentence>","confidence":"high"|"medium"|"low"}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', temperature: 0.25, max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return NextResponse.json({ error: 'AI analysis failed.' }, { status: 500 });

    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const raw  = data.choices?.[0]?.message?.content;
    if (!raw) return NextResponse.json({ error: 'AI analysis failed.' }, { status: 500 });

    return NextResponse.json({
      commodity: filters.commodity || 'All', state: filters.state || 'All', market: filters.market || 'All',
      ...JSON.parse(raw),
      latestPrice: prices.at(-1) ?? null, data_points: prices.length, real_data_points: prices.length,
    });
  } catch {
    return NextResponse.json({ error: 'Insights service unavailable.' }, { status: 503 });
  }
}
