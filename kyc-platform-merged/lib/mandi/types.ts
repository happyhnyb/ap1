/** Internal types for the mandi engine (not exposed to frontend). */

export interface MandiRecord {
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
  arrivals?:    number | null;
}

export interface MandiHistoryPoint {
  arrival_date:    string;
  avg_modal_price: number | null;
  avg_min_price:   number | null;
  avg_max_price:   number | null;
  markets_count:   number;
  records_count:   number;
}

export interface MandiFilters {
  commodity: string;
  state:     string;
  district:  string;
  market:    string;
  variety:   string;
  grade:     string;
}

export interface HoltResult {
  forecast:    { date: string; price: number; lower: number; upper: number }[];
  mape:        number;
  direction:   'up' | 'down' | 'flat';
  trend_pct:   number;
  alpha:       number;
  beta:        number;
  data_points: number;
}

export interface BacktestResult {
  mae:   number | null;
  rmse:  number | null;
  smape: number | null;
}
