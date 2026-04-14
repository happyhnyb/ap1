# Production Commodity Forecasting System — Technical Design

> **Scope**: Indian mandi (APMC) modal price prediction for 50+ commodities.  
> **Data source**: Agmarknet (data.gov.in), 91+ daily snapshots cached on disk.  
> **Runtime**: Next.js serverless (TypeScript, no native ML binaries).  
> **Model type**: Deterministic statistical + gradient-boosted regression trees (pure TS).  
> **Forecast horizon**: 1–14 days ahead. Multiple horizons via direct multi-step.

---

## 1. Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                        API Layer (Next.js)                          │
│  /forecast  /forecast/compare  /forecast/quality  /forecast/drivers │
└───────────────────────┬────────────────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────────────────┐
│                     Forecasting Engine                              │
│  load → preprocess → features → [train all models] → select        │
│                                → generate forecast → explain        │
└────────────────────────────────────────────────────────────────────┘
         │              │                │                │
         ▼              ▼                ▼                ▼
   Data Loader    Preprocessor    Feature Eng.      Model Registry
   (snapshots     (quality flags  (lags, rolling,   Baseline:
   + Agmarknet    imputation      seasonality,        seasonal-naive
   fallback)      outlier det.)   spatial hooks)      Holt-Winters
                                                      SMA
                                                    Challenger:
                                                      GBRT (MSE)
                                                      GBRT (q10, q90)
```

### Champion/Challenger Loop
For each `(commodity_id, mandi_id, horizon_days)` triple:
1. All models are trained on available history.
2. Rolling-origin backtest scores each model on the validation window.
3. Champion = lowest sMAPE. Challengers logged alongside.
4. Forecast API serves the champion's predictions with full transparency.

### Entity Resolution Rule
User selections rarely arrive as perfect `(market, district, state)` triples. In production we resolve series with:
1. exact commodity normalization
2. state equality or normalized containment
3. district equality or normalized containment when district is supplied
4. market equality or normalized containment after stripping `APMC` and punctuation
5. tie-break by richer history and higher real-data count

This prevents false "no data" failures when the UI sends `market + state` but the stored canonical key also includes district, or when market labels differ only by `APMC`, punctuation, or spacing.

---

## 2. Canonical Data Schema

### 2.1 Input row (`TimeSeriesPoint`)
| Field | Type | Notes |
|---|---|---|
| `date` | `YYYY-MM-DD` | ISO, IST midnight |
| `commodity_id` | string | Normalized slug (e.g. `wheat`) |
| `mandi_id` | string | `"{market}\|{district}\|{state}"` lowercase slug |
| `state` | string | Raw state name |
| `district` | string | |
| `market` | string | |
| `modal_price` | number\|null | ₹/quintal |
| `min_price` | number\|null | ₹/quintal |
| `max_price` | number\|null | ₹/quintal |
| `arrivals` | number\|null | Quintals (when Agmarknet provides it) |
| `source` | `'agmarknet'` | |
| `freshness_hours` | number | Hours since record was reported |
| `quality` | `DataQualityFlags` | See §3 |

`arrivals` is optional and should be aggregated by day when multiple raw rows are merged for the same mandi-date key.

### 2.2 Quality flags (`DataQualityFlags`)
| Flag | Condition |
|---|---|
| `is_zero` | `modal_price === 0` |
| `is_stale` | Same modal price as previous reporting day |
| `is_outlier` | \|z-score\| > 3 over a 28-day rolling window |
| `is_imputed` | Value was gap-filled (linear interpolation) |
| `is_price_gap` | \|Δ%\| > 40% day-over-day |
| `outlier_zscore` | Raw z-score for transparency |

### 2.3 Feature vector (per training sample)
| Index | Name | Description |
|---|---|---|
| 0–7 | `lag_{1,2,3,5,7,14,21,28}` | Modal price t−k |
| 8–9 | `roll3_{mean,std}` | 3-day rolling stats |
| 10–11 | `roll7_{mean,std}` | 7-day rolling stats |
| 12–13 | `roll14_{mean,std}` | 14-day rolling stats |
| 14 | `roll28_mean` | 28-day rolling mean |
| 15–16 | `price_ratio_{7,28}` | (lag_1 / rollK_mean) − 1 |
| 17–18 | `dow_{sin,cos}` | Day-of-week cyclic encoding |
| 19–20 | `woy_{sin,cos}` | Week-of-year cyclic encoding |
| 21–22 | `month_{sin,cos}` | Month cyclic encoding |
| 23 | `state_avg` | Avg modal price, same commodity, same state, same day |
| 24 | `horizon_norm` | h / 14 (direct multi-step signal) |
| 25 | `weather_anomaly` | Placeholder hook (default 0) |
| 26 | `policy_event` | Placeholder hook (default 0) |

Total: **27 features**. NaN-imputed with training-column means before tree training.

---

## 3. Preprocessing Pipeline

```
Raw MandiRecords
       │
       ▼
 normalise commodity aliases (e.g. "Paddy(Common)" → "paddy")
 normalise unit to ₹/quintal (no conversion needed — Agmarknet is already quintal)
       │
       ▼
 group by (commodity_id, mandi_id) → time series
 sort by date, deduplicate
       │
       ▼
 detect zeros  →  flag is_zero
 detect stale  →  flag is_stale   (same value as t-1 or t-7, 3+ consecutive days)
 detect outliers → rolling z-score with 28-day window, flag if |z| > 3
 detect gaps   →  missing calendar days
       │
       ▼
 impute gaps:
   ≤ 3 consecutive days  → linear interpolation, mark is_imputed
   > 3 consecutive days  → leave as NaN (structural absence)
       │
       ▼
 clip outliers: replace flagged outlier values with rolling median
 (original preserved in quality.outlier_zscore for transparency)
       │
       ▼
 Clean TimeSeries → feature engineering
```

---

## 4. Feature Engineering

### Lag features
Computed at every timestep t:
- `lag_k = modal_price[t − k]`
- NaN if fewer than k data points exist before t.

### Rolling statistics
- `rollK_mean = mean(modal_price[t−K : t])` (last K days, excluding t)
- `rollK_std  = std(modal_price[t−K : t])`
- Computed only when at least ⌈K/2⌉ non-NaN values exist in window.

### Seasonality (cyclic encoding)
- Day of week: sin/cos(2π × dow / 7) — avoids "6 is far from 0" problem
- Week of year: sin/cos(2π × woy / 52)
- Month: sin/cos(2π × month / 12)

### Spatial feature
- `state_avg`: cross-market mean of modal_price for the same commodity on the same date, within the same state. Captures regional supply/demand signals.
- Requires the "wide" dataset (all markets) at inference time.

### Hook features (extension points)
```typescript
interface ExternalFeatureHook {
  weatherAnomalyScore(date: string, state: string): number; // default 0
  policyEventScore(date: string, commodity_id: string): number; // default 0
}
```
These are zero by default. Production deployments can inject real signals (IMD rainfall, MSP announcements, export ban dates).

### Frontend integration
The premium predictor UI should call:
- `/api/forecast` for champion forecast output
- `/api/forecast/quality` for warnings and benchmark metrics
- `/api/forecast/drivers` for explanation inputs and downstream AI narration

Legacy `/api/predictor/*` routes can continue to serve lightweight summary/history panels, but paid forecast UX should be anchored on the deterministic champion/challenger stack.

---

## 5. Models

### 5.1 Baseline: Seasonal Naive
- `ŷ_{t+h} = y_{t + ((h−1) mod L)}` where L = 7 (weekly seasonality).
- Fallback when < 14 data points.
- No parameter fitting. Always available as floor.

### 5.2 Baseline: Holt-Winters (additive, L=7)
- Requires ≥ 2L = 14 data points.
- Level (α), trend (β), seasonal (γ) — selected via walk-forward CV over {α,β,γ} grid.
- Intervals: ±1.28σ of in-sample residuals (80% CI → reported as 80% CI).

### 5.3 Baseline: Simple Moving Average (SMA)
- Bandwidth k selected from {3, 5, 7} by in-sample RMSE.
- Interval: point ± 1.28 × in-sample residual std.

### 5.4 Challenger: GBRT (Gradient Boosted Regression Trees)
- Pure TypeScript decision tree + boosting loop.
- Loss: MSE. Pseudo-residuals: `r_i = y_i − F_{m-1}(x_i)`.
- Leaf value: mean of residuals in leaf.
- Parameters: `n_estimators=50, lr=0.05, max_depth=4, min_samples_leaf=5`.
- **Direct multi-step**: one model per horizon h ∈ {1,2,...,14}.
- Minimum 10 training samples; excluded from competition otherwise.
- Feature importances: accumulated variance-reduction gain per feature, normalized.

### 5.5 Challenger: Quantile GBRT (lower/upper bounds)
- Pinball loss for τ ∈ {0.10, 0.90}.
- Pseudo-residuals: `r_i = τ if y_i ≥ F else τ−1`.
- Leaf value: τ-quantile of actual residuals in that leaf (Friedman 2001).
- Produces asymmetric confidence bands (important for skewed mandi prices).

### Model eligibility by data size
| n (data points) | Eligible models |
|---|---|
| < 7 | None — insufficient flag |
| 7–13 | Seasonal Naive, SMA |
| 14–29 | + Holt-Winters |
| ≥ 30 | + GBRT (for horizons where n−lags−h ≥ 10) |

---

## 6. Evaluation

### 6.1 Metrics
| Metric | Formula | Notes |
|---|---|---|
| **MAE** | mean(\|y − ŷ\|) | Same unit as price |
| **WAPE** | Σ\|y−ŷ\| / Σy × 100 | Weighted; robust to zero actuals |
| **sMAPE** | mean(2\|y−ŷ\|/(|y|+|ŷ|)) × 100 | Symmetric, bounded |
| **Dir. acc.** | mean(sign(Δy) == sign(Δŷ)) | Fraction of correct direction calls |
| **CI coverage** | mean(lower ≤ y ≤ upper) | Should be ≈ 0.80 for 80% bands |

### 6.2 Rolling-origin cross-validation
```
Timeline: [0 ─────── origin ─────── T]
           Train window    │  Test steps 1..h
                           ↑
                    slide origin forward
```
- First origin: at index `max(2L, 28)` (need enough history for warmup).
- Slide by 1 day at each step.
- Compute all metrics at each origin, average across all origins.
- **Champion selection**: model with lowest sMAPE on the validation window.

---

## 7. Explainability Layer

The explainability layer produces a `ModelExplanation` object consumed by:
1. The `/forecast/drivers` API (raw to frontend)
2. The downstream AI (OpenAI) layer for narrative generation

```typescript
interface OpenAIContext {
  model_family: string;           // "GBRT" | "Holt-Winters" | ...
  recent_history_summary: string; // "last 7 days: ₹2,100→₹2,200 (+4.8%)"
  forecast_summary: string;       // "14-day outlook: ₹2,300 (+4.5%), trending up"
  top_feature_narrative: string;  // "primary driver: lag_7 (0.34), roll7_mean (0.28)"
  anomalies_narrative: string;    // "outlier detected on 2026-04-01 (z=3.4)"
  confidence_note: string;        // "sMAPE: 3.2%, CI coverage: 87% on backtest"
  data_note: string;              // "based on 85 real data points (6 imputed)"
}
```

The AI layer is **never asked to generate numeric price values** — only to narrate the structured context above.

---

## 8. API Specification

### GET `/api/forecast`
```
Query: commodity, market, state, horizon (int 1–14, default 14), model (optional)
Response: ForecastResponse
  - commodity, market, state
  - latest_price, latest_date
  - forecast: ForecastPoint[] (point + lower + upper per day)
  - direction, trend_pct
  - model_used, meta (model type, data points, backtest metrics, disclaimer)
  - explanation (for AI consumption)
Auth: Premium
```

### GET `/api/forecast/compare`
```
Query: commodity, market, state, horizon
Response: CompareResponse
  - All eligible models' forecasts side by side
  - Each model's backtest metrics
  - champion_id
Auth: Premium
```

### GET `/api/forecast/quality`
```
Query: commodity, market, state
Response: QualityResponse
  - Data quality breakdown (missing, outlier, stale, zero days)
  - Backtest metrics per model
  - Recommended model
  - Warnings (e.g. "high stale ratio: 30%")
Auth: Premium
```

### GET `/api/forecast/drivers`
```
Query: commodity, market, state, horizon
Response: DriversResponse
  - top_features: FeatureImportance[] (GBRT) or parameters (stat models)
  - anomaly_flags: AnomalyFlag[]
  - recent_error_band: ±% based on backtest MAE
  - openai_context: OpenAIContext (structured, ready for AI narration)
Auth: Premium
```

---

## 9. Migration from Old Predictor

| Old (`/api/predictor/forecast`) | New (`/api/forecast`) |
|---|---|
| Holt's DES only | Champion across 5 model families |
| 30-day fetch window | 91-day snapshot window (3× more history) |
| No backtest | Rolling-origin CV with 5 metrics |
| Symmetric uncertainty bands | Quantile GBRT asymmetric bands |
| Single MAPE metric | MAE, WAPE, sMAPE, dir. acc., CI coverage |
| No feature explanation | Top-feature importances + anomaly flags |
| No model comparison | `/forecast/compare` exposes all models |

**Backward compatibility**: The old `/api/predictor/*` routes remain functional. No data migration needed — both systems read from the same Agmarknet snapshots.

---

## 10. Operational Notes

### Cold-start latency
- First request per (commodity, market): 2–6s (load snapshots + train models).
- Subsequent requests: < 200ms (Next.js fetch cache, 2h TTL).
- The `/forecast/compare` route is slower (trains all models) — acceptable for non-real-time use.

### Data freshness
- Agmarknet snapshots are ingested daily by the mandi-service.
- Forecast engine reads from `mandi-service/data/snapshots/` on disk.
- Fallback: live Agmarknet API if snapshots are absent.

### Model reliability thresholds
- If sMAPE > 30% on backtest, the forecast is flagged as `low_confidence`.
- If fewer than 7 real data points exist, returns `insufficient: true`.
- If > 50% of values are imputed, returns warning `high_synthetic_ratio`.

### Feature hook injection
```typescript
// In production, override defaultHooks with real implementations:
const hooks: ExternalFeatureHook = {
  weatherAnomalyScore: (date, state) => imdRainfallDeviation(date, state),
  policyEventScore: (date, commodity) => mspChangeFlag(date, commodity),
};
const engine = new ForecastingEngine({ hooks });
```

### GBRT hyperparameter tuning
- Current: fixed `{n_estimators:50, lr:0.05, max_depth:4, min_leaf:5}`.
- With > 180 days of data: increase `n_estimators` to 100, reduce `lr` to 0.03.
- A grid-search on the backtester can automate this — not implemented in v1.

---

## 11. Sample Outputs

### `/api/forecast?commodity=Wheat&state=Punjab&market=Amritsar&horizon=7`
```json
{
  "commodity": "Wheat",
  "commodity_id": "wheat",
  "market": "Amritsar",
  "mandi_id": "amritsar|amritsar|punjab",
  "state": "Punjab",
  "latest_price": 2380,
  "latest_date": "2026-04-13",
  "forecast": [
    { "date": "2026-04-14", "horizon_days": 1, "point": 2395, "lower": 2340, "upper": 2450 },
    { "date": "2026-04-15", "horizon_days": 2, "point": 2408, "lower": 2330, "upper": 2480 },
    { "date": "2026-04-20", "horizon_days": 7, "point": 2460, "lower": 2290, "upper": 2620 }
  ],
  "direction": "up",
  "trend_pct": 3.4,
  "model_used": "gbrt_h{h}",
  "meta": {
    "model_type": "gradient_boosted_regression_trees",
    "model_description": "Gradient Boosted Regression Trees with direct multi-step forecasting.",
    "data_points": 87,
    "real_data_points": 82,
    "has_synthetic_data": true,
    "backtest": { "mae": 48, "wape": 2.1, "smape": 2.0, "directional_accuracy": 0.72, "ci_coverage": 0.81 },
    "disclaimer": "Experimental price estimates. Not financial advice."
  },
  "explanation": {
    "model_family": "GBRT",
    "top_features": [
      { "feature_name": "lag_7", "importance": 0.34, "direction": "positive" },
      { "feature_name": "roll7_mean", "importance": 0.28, "direction": "positive" },
      { "feature_name": "lag_1", "importance": 0.18, "direction": "positive" }
    ],
    "parameters": {},
    "recent_error_band": 2.0,
    "anomaly_flags": [],
    "data_summary": { "n_real_points": 82, "date_range": ["2026-01-13","2026-04-13"], "has_gaps": true, "missing_ratio": 0.056 }
  }
}
```
