/**
 * Explanation builder.
 *
 * Takes a champion ModelForecastResult + TimeSeries and produces:
 *   1. Enriched ModelExplanation (anomaly flags, error band from backtest)
 *   2. OpenAIContext — structured narrative inputs (NO numeric generation by AI)
 */

import type {
  TimeSeries,
  ModelForecastResult,
  ModelExplanation,
  OpenAIContext,
  AnomalyFlag,
} from '../schema/types';

// ── Anomaly detection ─────────────────────────────────────────────────────────

function detectAnomalyFlags(ts: TimeSeries): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];
  const points = ts.points.filter((p) => p.modal_price !== null);

  for (const p of points) {
    if (p.quality.is_outlier) {
      flags.push({
        type: 'outlier',
        date: p.date,
        description: `Price ₹${Math.round(p.modal_price!)} flagged as outlier (z=${(p.quality.outlier_zscore ?? 0).toFixed(1)})`,
      });
    }
    if (p.quality.is_price_gap) {
      const idx = points.indexOf(p);
      const prev = idx > 0 ? points[idx - 1].modal_price : null;
      if (prev !== null) {
        const pct = ((p.modal_price! - prev) / prev * 100).toFixed(1);
        flags.push({
          type: 'gap',
          date: p.date,
          description: `Large price gap: ${pct}% change vs. previous day`,
        });
      }
    }
  }

  // Detect stale runs
  let staleStart: string | null = null;
  let staleLen = 0;
  for (const p of points) {
    if (p.quality.is_stale) {
      if (!staleStart) staleStart = p.date;
      staleLen++;
    } else {
      if (staleLen >= 3 && staleStart) {
        flags.push({
          type: 'stale',
          date: staleStart,
          description: `${staleLen} consecutive identical prices from ${staleStart}`,
        });
      }
      staleStart = null;
      staleLen = 0;
    }
  }

  // Keep only the most recent 5 anomalies (avoid overwhelming the AI prompt)
  return flags.slice(-5);
}

// ── History summary ───────────────────────────────────────────────────────────

function fmt(p: number): string {
  return `₹${Math.round(p).toLocaleString('en-IN')}`;
}

function historySummary(ts: TimeSeries, days = 7): string {
  const pts = ts.points
    .filter((p) => p.modal_price !== null)
    .slice(-days);
  if (pts.length < 2) return 'insufficient history';

  const first = pts[0].modal_price!;
  const last  = pts.at(-1)!.modal_price!;
  const chg   = ((last - first) / first * 100).toFixed(1);
  const sign  = last >= first ? '+' : '';
  return `last ${pts.length} days: ${fmt(first)} → ${fmt(last)} (${sign}${chg}%)`;
}

function forecastSummary(
  forecast: ModelForecastResult['points'],
  latestPrice: number | null,
): string {
  if (!forecast.length || !latestPrice) return 'no forecast available';
  const last = forecast.at(-1)!;
  const chg  = ((last.point - latestPrice) / latestPrice * 100).toFixed(1);
  const sign = last.point >= latestPrice ? '+' : '';
  const dir  = last.point > latestPrice * 1.01 ? 'trending up'
             : last.point < latestPrice * 0.99 ? 'trending down'
             : 'flat';
  return `${last.horizon_days}-day outlook: ${fmt(last.point)} (${sign}${chg}%), ${dir}`;
}

function featureNarrative(expl: ModelExplanation): string {
  if (!expl.top_features.length) {
    // Statistical model — use parameters
    const params = Object.entries(expl.parameters)
      .filter(([k]) => ['alpha', 'beta', 'gamma', 'k'].includes(k))
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    return `${expl.model_family} parameters: ${params || 'default'}`;
  }
  const top3 = expl.top_features.slice(0, 3);
  return 'primary drivers: ' + top3.map((f) => `${f.feature_name} (${(f.importance * 100).toFixed(1)}%)`).join(', ');
}

function anomalyNarrative(flags: AnomalyFlag[]): string {
  if (!flags.length) return 'no anomalies detected';
  return flags.map((f) => f.description).join('; ');
}

// ── Public builders ───────────────────────────────────────────────────────────

/**
 * Enrich a ModelExplanation with:
 *  - anomaly flags detected from the TimeSeries quality flags
 *  - error band from backtest metrics (if available)
 *  - data_summary from the TimeSeries
 */
export function enrichExplanation(
  expl: ModelExplanation,
  ts: TimeSeries,
  metrics: ModelForecastResult['metrics'],
  latestPrice: number | null,
): ModelExplanation {
  const anomalyFlags = detectAnomalyFlags(ts);
  const real = ts.real_count;
  const total = ts.points.length;

  // Error band: MAE as % of latest price
  let errorBand: number | null = null;
  if (metrics.mae !== null && latestPrice && latestPrice > 0) {
    errorBand = Math.round((metrics.mae / latestPrice) * 10000) / 100;
  }

  const dates = ts.points.map((p) => p.date);

  return {
    ...expl,
    anomaly_flags: anomalyFlags,
    recent_error_band: errorBand,
    data_summary: {
      n_real_points: real,
      date_range: dates.length ? [dates[0], dates.at(-1)!] : null,
      has_gaps: ts.imputed_count > 0,
      missing_ratio: total > 0 ? Math.round((ts.imputed_count / total) * 1000) / 1000 : 0,
    },
  };
}

/**
 * Build the structured OpenAIContext for downstream narrative generation.
 * The AI is NEVER asked to invent numeric values — only to narrate these inputs.
 */
export function buildOpenAIContext(
  ts: TimeSeries,
  champion: ModelForecastResult,
  latestPrice: number | null,
): OpenAIContext {
  const expl = champion.explanation;
  const m    = champion.metrics;

  return {
    model_family: expl.model_family,
    recent_history_summary: historySummary(ts, 7),
    forecast_summary:       forecastSummary(champion.points, latestPrice),
    top_feature_narrative:  featureNarrative(expl),
    anomalies_narrative:    anomalyNarrative(expl.anomaly_flags),
    confidence_note: [
      m.smape !== null  ? `sMAPE: ${m.smape.toFixed(1)}%`  : null,
      m.wape  !== null  ? `WAPE: ${m.wape.toFixed(1)}%`    : null,
      m.ci_coverage !== null ? `CI coverage: ${(m.ci_coverage * 100).toFixed(0)}%` : null,
    ].filter(Boolean).join(', ') || 'no backtest metrics available',
    data_note: `based on ${expl.data_summary.n_real_points} real data points` +
      (expl.data_summary.has_gaps ? ` (${ts.imputed_count} interpolated)` : ''),
  };
}
