import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import {
  getHistoricalRecords, filterRecords, buildHistory,
  holtForecast, rollingBacktest, filtersFromQuery,
} from '@/lib/mandi/engine';
import { canAccessPredictorRelease, predictorAccessError, PREDICTOR_DISCLAIMER } from '@/lib/product/predictor';

export const maxDuration = 60;

const MIN_REAL_DATA = 7;

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!canAccessPredictorRelease(session)) {
    return NextResponse.json({ error: predictorAccessError(session) }, { status: 403 });
  }

  const q: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => { q[k] = v; });
  const filters  = filtersFromQuery(q);
  const horizon  = Math.min(30, Math.max(3, Number(q.horizon || 14)));

  try {
    const { records, fetchedAt } = await getHistoricalRecords(filters);
    const filtered = filterRecords(records, filters);
    const history  = buildHistory(filtered);

    const prices = history
      .filter((h) => typeof h.avg_modal_price === 'number')
      .map((h) => h.avg_modal_price as number);

    if (prices.length < MIN_REAL_DATA) {
      return NextResponse.json({
        commodity:   filters.commodity || 'All',
        market:      filters.market    || 'All',
        state:       filters.state     || 'All',
        latestPrice: prices.at(-1) ?? null,
        forecast: [], direction: 'flat', trend_pct: 0,
        dataPoints: prices.length, realDataPoints: prices.length,
        insufficient: true,
        message: `Insufficient multi-day market history for this filter yet. Try narrowing to a specific state or market, or check again as more daily government records accumulate.`,
        insights: null,
      });
    }

    const result   = holtForecast(prices, horizon);
    if (!result) {
      return NextResponse.json({ insufficient: true, message: 'Could not compute forecast.', insights: null });
    }

    const backtest = rollingBacktest(prices);

    let insights = null;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && q.insights !== 'false') {
      insights = await generateInsights(openaiKey, filters.commodity, filters.state, filters.market, history, result);
    }

    const meta = {
      model_type:         'holt_double_exponential_smoothing' as const,
      model_description:  "Adaptive Holt's Double Exponential Smoothing (trend extrapolation). Not ML.",
      alpha:              result.alpha,
      beta:               result.beta,
      mape:               result.mape,
      mae:                backtest.mae,
      rmse:               backtest.rmse,
      smape:              backtest.smape,
      data_points:        prices.length,
      real_data_points:   prices.length,
      synthetic_ratio:    0,
      has_synthetic_data: false,
      disclaimer:
        `${PREDICTOR_DISCLAIMER} Based on ${prices.length} daily data points. Last fetched: ${fetchedAt?.slice(0, 10) ?? 'unknown'}.`,
    };

    return NextResponse.json({
      commodity:   filters.commodity || 'All',
      market:      filters.market    || 'All',
      state:       filters.state     || 'All',
      latestPrice: prices.at(-1) ?? null,
      forecast:    result.forecast,
      direction:   result.direction,
      trend_pct:   result.trend_pct,
      dataPoints:  prices.length,
      insufficient: false,
      meta,
      insights,
    });
  } catch (err) {
    console.error('[forecast]', err);
    return NextResponse.json({ error: 'Predictor service unavailable.' }, { status: 503 });
  }
}

async function generateInsights(
  apiKey: string,
  commodity: string, state: string, market: string,
  history: { arrival_date: string; avg_modal_price: number | null }[],
  result: { forecast: { date: string; price: number; lower: number; upper: number }[]; alpha: number; beta: number; mape: number; direction: string; trend_pct: number; data_points: number }
) {
  const histSummary  = history.slice(-30).map((h) => `${h.arrival_date}: ₹${h.avg_modal_price ?? '–'}/qtl`).join(' | ');
  const fcastSummary = result.forecast.slice(0, 7).map((f) => `${f.date}: ₹${f.price} (${f.lower}–${f.upper})`).join(' | ');

  const prompt = `You are a senior commodity analyst for Indian agricultural markets.
Commodity: ${commodity || 'All'}  State: ${state || 'All India'}  Market: ${market || 'All'}
Historical avg modal price (last 30 days, ₹/qtl): ${histSummary}
14-day forecast (α=${result.alpha}, β=${result.beta}): ${fcastSummary}
Trend: ${result.direction} (${result.trend_pct > 0 ? '+' : ''}${result.trend_pct}%)  MAPE: ${result.mape}%

Respond ONLY with a JSON object (no markdown):
{"outlook":"<2-3 sentences>","drivers":["<d1>","<d2>","<d3>"],"risks":["<r1>","<r2>"],"signal":"Buy"|"Hold"|"Wait","signal_reason":"<1 sentence>","confidence":"high"|"medium"|"low"}`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', temperature: 0.25, max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const raw  = data.choices?.[0]?.message?.content;
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
