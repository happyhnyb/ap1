/**
 * Shared types for the predictor service contract.
 * Both the Next.js proxy routes and the frontend components import from here.
 *
 * Model: Adaptive Holt's Double Exponential Smoothing (level + trend).
 * This is a statistical trend-extrapolation method, not machine learning.
 * It is appropriate for short-term commodity price estimation with ≥7 data points.
 * Forecasts should be treated as indicative estimates only.
 */

export interface MandiStatus {
  lastRefreshAt:    string | null;
  lastSnapshotDate: string | null;
  lastRecordCount:  number;
  inProgress:       boolean;
  error:            string | null;
  totalSnapshots:   number;
  snapshotDates:    string[];
}

export interface MandiOptions {
  commodities: string[];
  states:      string[];
  districts:   string[];
  markets:     string[];
  varieties:   string[];
  grades:      string[];
}

export interface MandiSummary {
  latestSnapshotDate: string | null;
  latestArrivalDate:  string | null;
  recordsCount:       number;
  marketsCount:       number;
  avgModalPrice:      number | null;
  avgMinPrice:        number | null;
  avgMaxPrice:        number | null;
  lowestModalPrice:   number | null;
  highestModalPrice:  number | null;
  topMarkets: {
    market:       string;
    district:     string;
    state:        string;
    modal_price:  number | null;
    min_price:    number | null;
    max_price:    number | null;
    arrival_date: string;
  }[];
}

export interface MandiHistoryPoint {
  arrival_date:    string;
  avg_modal_price: number | null;
  avg_min_price:   number | null;
  avg_max_price:   number | null;
  markets_count:   number;
  records_count:   number;
}

export interface MandiTableResult {
  page:     number;
  pageSize: number;
  total:    number;
  rows: {
    state:        string;
    district:     string;
    market:       string;
    commodity:    string;
    variety:      string;
    grade:        string;
    arrival_date: string;
    min_price:    number | null;
    max_price:    number | null;
    modal_price:  number | null;
  }[];
}

/** Metadata that every forecast response must include for transparency. */
export interface ForecastMeta {
  /** Type of model used — always disclose. */
  model_type:        'holt_double_exponential_smoothing';
  /** Human-readable model description for UI display. */
  model_description: string;
  /** Best-fit smoothing parameters (selected via walk-forward cross-validation). */
  alpha:             number;
  beta:              number;
  /** In-sample MAPE — treat as a rough accuracy indicator only. */
  mape:              number;
  /** Rolling 1-step MAE from backtest (null if < 14 data points). */
  mae:               number | null;
  /** Rolling 1-step RMSE from backtest (null if < 14 data points). */
  rmse:              number | null;
  /** Rolling 1-step sMAPE from backtest (null if < 14 data points). */
  smape:             number | null;
  /** Number of daily data points used for this forecast. More = more reliable. */
  data_points:       number;
  /** Number of data points from REAL (non-synthetic) sources. */
  real_data_points:  number;
  /** Ratio of synthetic (backfilled) to real data points, 0–1. */
  synthetic_ratio:   number;
  /** Whether any synthetic data was used. Synthetic data may reduce accuracy. */
  has_synthetic_data: boolean;
  /** Disclaimer shown in UI — never suppress. */
  disclaimer:        string;
}

export interface ForecastPoint {
  date:  string;
  price: number;
  lower: number;
  upper: number;
}

export interface PriceInsights {
  outlook:       string;
  drivers:       string[];
  risks:         string[];
  signal:        'Buy' | 'Hold' | 'Wait';
  signal_reason: string;
  confidence:    'high' | 'medium' | 'low';
}

export interface ForecastResult {
  commodity:   string;
  market:      string;
  state:       string;
  latestPrice: number | null;
  forecast:    ForecastPoint[];
  direction:   'up' | 'down' | 'flat';
  trend_pct:   number;
  dataPoints:  number;
  /** Number of real (non-synthetic) data points used. */
  realDataPoints?: number;
  insufficient: boolean;
  message?:    string;
  /** Forecast metadata — always present on a successful forecast. */
  meta?:       ForecastMeta;
  /** OpenAI-generated insights — null if OpenAI is not configured or unavailable. */
  insights:    PriceInsights | null;
}

export interface InsightsResult extends PriceInsights {
  commodity:   string;
  state:       string;
  market:      string;
  latestPrice: number | null;
  data_points: number;
}

/** Standard API error envelope. */
export interface ApiError {
  error: string;
}
