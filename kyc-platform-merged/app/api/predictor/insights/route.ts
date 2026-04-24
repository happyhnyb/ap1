import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/jwt';
import { canAccessPredictorRelease, predictorAccessError } from '@/lib/product/predictor';
import { getHistoricalRecords, filterRecords, buildHistory, holtForecast, filtersFromQuery } from '@/lib/mandi/engine';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  if (!canAccessPredictorRelease(session)) {
    return NextResponse.json({ error: predictorAccessError(session) }, { status: 403 });
  }

  const q: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => { q[k] = v; });
  const filters = filtersFromQuery(q);

  try {
    const { records } = await getHistoricalRecords(filters);
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

    const directionLabel = forecastResult.direction === 'up'
      ? 'firming'
      : forecastResult.direction === 'down'
        ? 'softening'
        : 'moving sideways';
    const latestPrice = prices.at(-1) ?? null;
    const confidence =
      forecastResult.mape <= 6 ? 'high'
        : forecastResult.mape <= 12 ? 'medium'
          : 'low';
    const signal =
      forecastResult.direction === 'up' && forecastResult.trend_pct > 3 ? 'Buy'
        : forecastResult.direction === 'down' && forecastResult.trend_pct < -3 ? 'Wait'
          : 'Hold';
    const recentWindow = prices.slice(-7);
    const recentMin = Math.min(...recentWindow);
    const recentMax = Math.max(...recentWindow);
    const outlook = `${filters.commodity || 'This market'} is ${directionLabel} over the next 14 days based on local mandi history and Holt trend smoothing. The latest observed modal price is ${latestPrice != null ? `Rs ${latestPrice}/qtl` : 'not available'}, with model error around ${forecastResult.mape}% in recent backtests.`;
    const drivers = [
      `Recent 7-day price band: Rs ${recentMin} to Rs ${recentMax}/qtl`,
      `Trend direction: ${forecastResult.direction} (${forecastResult.trend_pct > 0 ? '+' : ''}${forecastResult.trend_pct}%)`,
      `Model parameters alpha ${forecastResult.alpha}, beta ${forecastResult.beta}`,
    ];
    const risks = [
      'Mandi arrivals or local supply can shift faster than the model updates.',
      forecastResult.mape > 10 ? 'Backtest error is elevated, so treat the signal as directional only.' : 'Forecast error remains moderate but not exact for daily execution.',
    ];
    const signalReason =
      signal === 'Buy'
        ? 'Momentum is positive and recent prices are trending higher.'
        : signal === 'Wait'
          ? 'Momentum is negative, so waiting may reduce downside timing risk.'
          : 'The current setup is mixed, so staying neutral is safer than forcing a trade.';

    return NextResponse.json({
      commodity: filters.commodity || 'All', state: filters.state || 'All', market: filters.market || 'All',
      outlook,
      drivers,
      risks,
      signal,
      signal_reason: signalReason,
      confidence,
      latestPrice,
      data_points: prices.length,
      real_data_points: prices.length,
    });
  } catch {
    return NextResponse.json({ error: 'Insights service unavailable.' }, { status: 503 });
  }
}
