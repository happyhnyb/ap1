/**
 * Canonical type definitions for the commodity forecasting system.
 *
 * All prices are in ₹/quintal. All dates are ISO YYYY-MM-DD strings.
 * Numeric arrays use NaN (not null) for missing values so they can be
 * processed by typed numeric routines without null guards.
 */

// ── Input / raw record ────────────────────────────────────────────────────────

export interface DataQualityFlags {
  /** modal_price === 0 */
  is_zero: boolean;
  /** Same price as the previous reporting day (at least 3 consecutive) */
  is_stale: boolean;
  /** |z-score| > 3 in a 28-day rolling window */
  is_outlier: boolean;
  /** Value was filled in by linear interpolation */
  is_imputed: boolean;
  /** |Δ%| > 40% day-over-day */
  is_price_gap: boolean;
  /** Raw z-score (null if window too small) */
  outlier_zscore: number | null;
}

export const DEFAULT_QUALITY: DataQualityFlags = {
  is_zero: false,
  is_stale: false,
  is_outlier: false,
  is_imputed: false,
  is_price_gap: false,
  outlier_zscore: null,
};

export interface TimeSeriesPoint {
  date: string;               // YYYY-MM-DD
  commodity_id: string;       // normalized slug e.g. "wheat"
  mandi_id: string;           // "{market}|{district}|{state}" lowercase
  state: string;
  district: string;
  market: string;
  modal_price: number | null;
  min_price: number | null;
  max_price: number | null;
  arrivals: number | null;    // quintals arriving that day (often absent)
  source: 'agmarknet';
  freshness_hours: number;
  quality: DataQualityFlags;
}

/** A complete, sorted, preprocessed time series for one (commodity, mandi) pair. */
export interface TimeSeries {
  commodity_id: string;
  commodity: string;          // display name
  mandi_id: string;
  state: string;
  district: string;
  market: string;
  /** Points sorted ascending by date. Some modal_price values may be null (structural gaps). */
  points: TimeSeriesPoint[];
  freshness: 'live' | 'stale' | 'insufficient';
  real_count: number;         // non-imputed, non-null points
  imputed_count: number;
}

// ── Feature matrix ─────────────────────────────────────────────────────────────

export interface FeatureMatrix {
  /** [n_samples × n_features]. NaN for unavailable features. */
  X: number[][];
  /** Modal price targets for each sample row. */
  y: number[];
  /** Human-readable name for each column in X. */
  featureNames: string[];
  /** ISO date associated with each sample (the date being predicted). */
  dates: string[];
}

// ── Forecast output ───────────────────────────────────────────────────────────

export interface ForecastPoint {
  date: string;
  horizon_days: number;
  /** Point forecast, ₹/quintal. */
  point: number;
  /** Lower bound (~10th percentile). */
  lower: number;
  /** Upper bound (~90th percentile). */
  upper: number;
}

// ── Evaluation ─────────────────────────────────────────────────────────────────

export interface BacktestMetrics {
  /** Mean Absolute Error (₹/quintal) */
  mae: number | null;
  /** Weighted Absolute Percentage Error (%) */
  wape: number | null;
  /** Symmetric Mean Absolute Percentage Error (%) */
  smape: number | null;
  /** Fraction of timesteps where predicted direction matched actual */
  directional_accuracy: number | null;
  /** Fraction of actual values inside [lower, upper] (target ≈ 0.80) */
  ci_coverage: number | null;
  /** Number of (origin, horizon) test pairs used */
  n_test_points: number;
}

export const NULL_METRICS: BacktestMetrics = {
  mae: null, wape: null, smape: null,
  directional_accuracy: null, ci_coverage: null, n_test_points: 0,
};

// ── Explainability ─────────────────────────────────────────────────────────────

export interface FeatureImportance {
  feature_name: string;
  importance: number;          // normalized 0–1 (sum to 1)
  direction: 'positive' | 'negative' | 'mixed';
}

export interface AnomalyFlag {
  type: 'outlier' | 'stale' | 'gap' | 'trend_break';
  date: string;
  description: string;
}

export interface ModelExplanation {
  model_family: string;
  model_id: string;
  top_features: FeatureImportance[];
  /** Alpha/beta/gamma etc. for statistical models; empty for GBRT. */
  parameters: Record<string, number>;
  /** ±% based on backtest MAE / latest_price × 100 */
  recent_error_band: number | null;
  anomaly_flags: AnomalyFlag[];
  data_summary: {
    n_real_points: number;
    date_range: [string, string] | null;
    has_gaps: boolean;
    missing_ratio: number;
  };
}

/** Structured context passed to OpenAI for narrative generation.
 *  OpenAI is NEVER given numeric values to invent — only to narrate. */
export interface OpenAIContext {
  model_family: string;
  recent_history_summary: string;
  forecast_summary: string;
  top_feature_narrative: string;
  anomalies_narrative: string;
  confidence_note: string;
  data_note: string;
}

// ── Model interface ────────────────────────────────────────────────────────────

export interface ModelForecastResult {
  modelId: string;
  points: ForecastPoint[];
  metrics: BacktestMetrics;
  explanation: ModelExplanation;
  /** True if this model was elected champion for this series+horizon. */
  is_champion: boolean;
}

// ── Champion/challenger ────────────────────────────────────────────────────────

export interface ChampionResult {
  champion_id: string;
  selected_by: 'smape' | 'wape' | 'default';
  models: ModelForecastResult[];
}

// ── API response shapes ────────────────────────────────────────────────────────

export interface ForecastMeta {
  model_type: string;
  model_description: string;
  data_points: number;
  real_data_points: number;
  has_synthetic_data: boolean;
  backtest: BacktestMetrics;
  disclaimer: string;
}

export interface ForecastResponse {
  commodity: string;
  commodity_id: string;
  market: string;
  mandi_id: string;
  state: string;
  latest_price: number | null;
  latest_date: string | null;
  forecast: ForecastPoint[];
  direction: 'up' | 'down' | 'flat';
  trend_pct: number;
  model_used: string;
  insufficient: boolean;
  message?: string;
  meta: ForecastMeta;
  explanation: ModelExplanation;
}

export interface CompareResponse {
  commodity: string;
  market: string;
  state: string;
  champion_id: string;
  models: {
    modelId: string;
    forecast: ForecastPoint[];
    metrics: BacktestMetrics;
    is_champion: boolean;
  }[];
}

export interface QualityResponse {
  commodity: string;
  market: string;
  state: string;
  data_quality: {
    total_days: number;
    real_days: number;
    missing_days: number;
    outlier_days: number;
    stale_days: number;
    zero_days: number;
    imputed_days: number;
    missing_ratio: number;
    date_range: [string, string] | null;
  };
  backtest_by_model: Record<string, BacktestMetrics>;
  recommended_model: string;
  warnings: string[];
}

export interface DriversResponse {
  commodity: string;
  market: string;
  state: string;
  model_used: string;
  top_features: FeatureImportance[];
  anomaly_flags: AnomalyFlag[];
  recent_error_band: number | null;
  openai_context: OpenAIContext;
}
