import { describe, it, expect } from 'vitest';
import type {
  ForecastResult,
  ForecastMeta,
  ForecastPoint,
  PriceInsights,
} from '../lib/predictor/types';

/**
 * Validates that a ForecastResult object conforms to the expected contract.
 * This guards against the server breaking the frontend's data expectations.
 */
function validateForecastResult(r: ForecastResult): string[] {
  const errors: string[] = [];

  if (typeof r.commodity !== 'string') errors.push('commodity must be a string');
  if (typeof r.market !== 'string') errors.push('market must be a string');
  if (typeof r.state !== 'string') errors.push('state must be a string');
  if (r.latestPrice !== null && typeof r.latestPrice !== 'number') errors.push('latestPrice must be number or null');
  if (!Array.isArray(r.forecast)) errors.push('forecast must be an array');
  if (!['up', 'down', 'flat'].includes(r.direction)) errors.push('direction must be up|down|flat');
  if (typeof r.trend_pct !== 'number') errors.push('trend_pct must be a number');
  if (typeof r.insufficient !== 'boolean') errors.push('insufficient must be boolean');

  if (!r.insufficient && r.forecast.length > 0 && r.meta) {
    const m = r.meta;
    if (m.model_type !== 'holt_double_exponential_smoothing') {
      errors.push('meta.model_type must be holt_double_exponential_smoothing');
    }
    if (typeof m.alpha !== 'number' || m.alpha < 0 || m.alpha > 1) errors.push('meta.alpha must be in [0,1]');
    if (typeof m.beta !== 'number' || m.beta < 0 || m.beta > 1) errors.push('meta.beta must be in [0,1]');
    if (typeof m.mape !== 'number' || m.mape < 0) errors.push('meta.mape must be a non-negative number');
    if (typeof m.data_points !== 'number' || m.data_points < 1) errors.push('meta.data_points must be >= 1');
    if (typeof m.synthetic_ratio !== 'number' || m.synthetic_ratio < 0 || m.synthetic_ratio > 1) {
      errors.push('meta.synthetic_ratio must be in [0,1]');
    }
    if (typeof m.has_synthetic_data !== 'boolean') errors.push('meta.has_synthetic_data must be boolean');
    if (!m.disclaimer || m.disclaimer.length < 20) errors.push('meta.disclaimer must be a meaningful string');
  }

  for (const point of r.forecast) {
    if (typeof point.date !== 'string') errors.push('forecast[].date must be string');
    if (typeof point.price !== 'number') errors.push('forecast[].price must be number');
    if (typeof point.lower !== 'number') errors.push('forecast[].lower must be number');
    if (typeof point.upper !== 'number') errors.push('forecast[].upper must be number');
    if (point.lower > point.price) errors.push('forecast[].lower must be <= price');
    if (point.upper < point.price) errors.push('forecast[].upper must be >= price');
  }

  return errors;
}

describe('ForecastResult contract', () => {
  it('passes a valid well-formed result', () => {
    const meta: ForecastMeta = {
      model_type: 'holt_double_exponential_smoothing',
      model_description: "Adaptive Holt's Double Exponential Smoothing",
      alpha: 0.3,
      beta: 0.1,
      mape: 5.2,
      mae: 110, rmse: 135, smape: 4.8,
      data_points: 30,
      real_data_points: 30,
      synthetic_ratio: 0.0,
      has_synthetic_data: false,
      disclaimer: 'Experimental estimates only. Not financial advice.',
    };

    const forecast: ForecastPoint[] = [
      { date: '2026-04-10', price: 2500, lower: 2400, upper: 2600 },
      { date: '2026-04-11', price: 2520, lower: 2410, upper: 2630 },
    ];

    const result: ForecastResult = {
      commodity: 'Tomato', market: 'Azadpur', state: 'Delhi',
      latestPrice: 2480, forecast, direction: 'up', trend_pct: 1.6,
      dataPoints: 30,
      insufficient: false, meta, insights: null,
    };

    expect(validateForecastResult(result)).toEqual([]);
  });

  it('detects invalid direction', () => {
    const result = {
      commodity: 'X', market: 'Y', state: 'Z',
      latestPrice: null, forecast: [], direction: 'sideways',
      trend_pct: 0, insufficient: true, insights: null,
    } as any;
    const errors = validateForecastResult(result);
    expect(errors.some(e => e.includes('direction'))).toBe(true);
  });

  it('detects forecast point with lower > price', () => {
    const result: ForecastResult = {
      commodity: 'X', market: 'Y', state: 'Z',
      latestPrice: 100, direction: 'up', trend_pct: 0.1,
      dataPoints: 14,
      insufficient: false, insights: null,
      forecast: [{ date: '2026-04-10', price: 100, lower: 200, upper: 300 }],
    };
    const errors = validateForecastResult(result);
    expect(errors.some(e => e.includes('lower must be <= price'))).toBe(true);
  });

  it('detects alpha out of range', () => {
    const meta: ForecastMeta = {
      model_type: 'holt_double_exponential_smoothing',
      model_description: 'test',
      alpha: 1.5,  // invalid
      beta: 0.1,
      mape: 3,
      mae: null, rmse: null, smape: null,
      data_points: 10,
      real_data_points: 10,
      synthetic_ratio: 0,
      has_synthetic_data: false,
      disclaimer: 'Experimental estimates only. Not financial advice.',
    };
    const result: ForecastResult = {
      commodity: 'X', market: 'Y', state: 'Z',
      latestPrice: 100, direction: 'up', trend_pct: 1,
      dataPoints: 10,
      insufficient: false, meta, insights: null,
      forecast: [{ date: '2026-04-10', price: 100, lower: 90, upper: 110 }],
    };
    const errors = validateForecastResult(result);
    expect(errors.some(e => e.includes('meta.alpha'))).toBe(true);
  });

  it('allows null insights when OpenAI unavailable', () => {
    const result: ForecastResult = {
      commodity: 'Onion', market: 'Lasalgaon', state: 'Maharashtra',
      latestPrice: 3200, direction: 'flat', trend_pct: 0.3,
      dataPoints: 30,
      insufficient: false, insights: null,
      forecast: [{ date: '2026-04-10', price: 3200, lower: 3100, upper: 3300 }],
    };
    expect(validateForecastResult(result)).toEqual([]);
  });

  it('passes insufficient=true result without meta requirement', () => {
    const result: ForecastResult = {
      commodity: 'Rare', market: 'Unknown', state: 'X',
      latestPrice: null, direction: 'flat', trend_pct: 0,
      dataPoints: 3,
      insufficient: true, message: 'Not enough data points.',
      forecast: [], insights: null,
    };
    expect(validateForecastResult(result)).toEqual([]);
  });
});
