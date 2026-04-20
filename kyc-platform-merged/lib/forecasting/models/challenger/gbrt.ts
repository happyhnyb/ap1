/**
 * Gradient Boosted Regression Trees (GBRT) — pure TypeScript.
 *
 * Uses the RegressionTree weak learner.
 * Trains three ensembles per horizon:
 *   1. Point forecast (MSE loss, mean leaf)
 *   2. Lower bound  (Pinball τ=0.10, quantile leaf — Friedman 2001)
 *   3. Upper bound  (Pinball τ=0.90, quantile leaf)
 *
 * Direct multi-step forecasting: one GBRTEnsemble per horizon h.
 * Features at time t predict prices[t + h - 1].
 *
 * Feature NaN handling: imputed with training column means (stored for reuse at inference).
 *
 * Minimum: MIN_TRAIN_SAMPLES training rows; horizon excluded from competition otherwise.
 */

import type { TimeSeries, ForecastPoint, ModelExplanation, FeatureImportance } from '../../schema/types';
import type { ForecastModel, PredictOptions } from '../interface';
import { RegressionTree } from './tree';
import {
  buildFeatureMatrix,
  buildInferenceVector,
  imputeFeatures,
  imputeVector,
  N_FEATURES,
  FEATURE_NAMES,
} from '../../features/index';
import { forecastDatesFromSeries } from '../utils';

const MIN_TRAIN_SAMPLES = 10;
const N_ESTIMATORS = 50;
const LEARNING_RATE = 0.05;
const MAX_DEPTH = 4;
const MIN_LEAF = 5;
const QUANTILE_LO = 0.10;
const QUANTILE_HI = 0.90;

// ── Quantile helpers ──────────────────────────────────────────────────────────

function quantile(arr: number[], tau: number): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = tau * (s.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return s[lo] + (idx - lo) * (s[hi] - s[lo]);
}

// ── Single ensemble (one loss function) ──────────────────────────────────────

interface GBRTEnsembleOptions {
  nEstimators: number;
  lr: number;
  maxDepth: number;
  minLeaf: number;
  /** 'mse' → mean leaf; 'quantile' → quantile leaf with given tau */
  loss: 'mse' | 'quantile';
  tau?: number;
}

class GBRTEnsemble {
  private trees: RegressionTree[] = [];
  private F0 = 0;
  private opts: GBRTEnsembleOptions;
  /** Accumulated feature importances across all trees. */
  readonly importances = new Array<number>(N_FEATURES).fill(0);

  constructor(opts: GBRTEnsembleOptions) {
    this.opts = opts;
  }

  fit(X: number[][], y: number[]): void {
    const { nEstimators, lr, maxDepth, minLeaf, loss, tau = 0.5 } = this.opts;
    const n = y.length;

    // Initialise ensemble prediction
    this.F0 = loss === 'quantile' ? quantile(y, tau) : y.reduce((s, v) => s + v, 0) / n;
    const F = new Array<number>(n).fill(this.F0);

    for (let m = 0; m < nEstimators; m++) {
      let splitTargets: number[];
      let leafTargets: number[];

      if (loss === 'mse') {
        // Pseudo-residuals for MSE: y_i - F_{m-1}(x_i)
        splitTargets = y.map((yi, i) => yi - F[i]);
        leafTargets  = splitTargets;
      } else {
        // Pseudo-residuals for pinball loss: τ if y ≥ F else τ−1
        splitTargets = y.map((yi, i) => yi >= F[i] ? tau : tau - 1);
        // Leaf values: τ-quantile of actual residuals in each leaf (Friedman 2001)
        leafTargets  = y.map((yi, i) => yi - F[i]);
      }

      const tree = new RegressionTree({
        maxDepth,
        minSamplesLeaf: minLeaf,
        leafMode: loss === 'quantile' ? 'quantile' : 'mean',
        tau: loss === 'quantile' ? tau : 0.5,
      });

      tree.fit(X, splitTargets, leafTargets);
      this.trees.push(tree);

      // Accumulate feature importances
      tree.featureImportances.forEach((imp, fi) => {
        this.importances[fi] += imp;
      });

      // Update ensemble predictions
      for (let i = 0; i < n; i++) {
        F[i] += lr * tree.predict(X[i]);
      }
    }
  }

  predict(x: number[]): number {
    let pred = this.F0;
    for (const tree of this.trees) {
      pred += this.opts.lr * tree.predict(x);
    }
    return Math.max(0, pred);
  }
}

// ── Per-horizon trained model bundle ─────────────────────────────────────────

interface HorizonBundle {
  horizon: number;
  point:   GBRTEnsemble;
  lower:   GBRTEnsemble;
  upper:   GBRTEnsemble;
  colMeans: number[];     // imputation means from training
  trainedOn: number;      // number of training samples
}

// ── GBRT model class ──────────────────────────────────────────────────────────

export class GBRTModel implements ForecastModel {
  readonly id = 'gbrt_mse';
  readonly name = 'GBRT (Gradient Boosted Regression Trees)';
  readonly family = 'GBRT';
  readonly minDataPoints = 30; // need enough for feature warmup + training

  private fitted = false;
  private bundles = new Map<number, HorizonBundle>();
  private globalImportances = new Array<number>(N_FEATURES).fill(0);
  private ts!: TimeSeries;

  fit(ts: TimeSeries): boolean {
    const nonNull = ts.points.filter((p) => p.modal_price !== null);
    if (nonNull.length < this.minDataPoints) {
      this.fitted = false;
      return false;
    }

    this.ts = ts;
    this.bundles.clear();
    this.globalImportances.fill(0);

    let anyFitted = false;

    for (let h = 1; h <= 14; h++) {
      const fm = buildFeatureMatrix(ts, { horizon: h, minSamples: MIN_TRAIN_SAMPLES });
      if (!fm) continue; // insufficient samples for this horizon

      const { X: Xraw, y } = fm;
      const { X, colMeans } = imputeFeatures(Xraw);

      if (X.length < MIN_TRAIN_SAMPLES) continue;

      const pointEns = new GBRTEnsemble({ nEstimators: N_ESTIMATORS, lr: LEARNING_RATE, maxDepth: MAX_DEPTH, minLeaf: MIN_LEAF, loss: 'mse' });
      const lowerEns = new GBRTEnsemble({ nEstimators: N_ESTIMATORS, lr: LEARNING_RATE, maxDepth: MAX_DEPTH, minLeaf: MIN_LEAF, loss: 'quantile', tau: QUANTILE_LO });
      const upperEns = new GBRTEnsemble({ nEstimators: N_ESTIMATORS, lr: LEARNING_RATE, maxDepth: MAX_DEPTH, minLeaf: MIN_LEAF, loss: 'quantile', tau: QUANTILE_HI });

      pointEns.fit(X, y);
      lowerEns.fit(X, y);
      upperEns.fit(X, y);

      // Accumulate global importances from point ensemble
      pointEns.importances.forEach((imp, fi) => {
        this.globalImportances[fi] += imp;
      });

      this.bundles.set(h, { horizon: h, point: pointEns, lower: lowerEns, upper: upperEns, colMeans, trainedOn: X.length });
      anyFitted = true;
    }

    this.fitted = anyFitted;
    return anyFitted;
  }

  predict(ts: TimeSeries, opts: PredictOptions): ForecastPoint[] {
    if (!this.fitted || !this.bundles.size) return [];
    const { horizon, stateAverages = new Map(), hooks } = opts;
    const targetDates = forecastDatesFromSeries(ts, horizon);
    const results: ForecastPoint[] = [];

    for (let h = 1; h <= horizon; h++) {
      const bundle = this.bundles.get(h);
      if (!bundle) {
        // Fall back to nearest trained horizon
        const fallbackH = [...this.bundles.keys()].reduce((best, bh) =>
          Math.abs(bh - h) < Math.abs(best - h) ? bh : best
        );
        const fb = this.bundles.get(fallbackH)!;

        const targetDate = targetDates[h - 1];

        const rawX  = buildInferenceVector(ts, h, targetDate, stateAverages.get(targetDate) ?? NaN, hooks);
        const x     = imputeVector(rawX, fb.colMeans);

        results.push({
          date: targetDate,
          horizon_days: h,
          point: Math.round(fb.point.predict(x) * 100) / 100,
          lower: Math.round(fb.lower.predict(x) * 100) / 100,
          upper: Math.round(fb.upper.predict(x) * 100) / 100,
        });
        continue;
      }

      const targetDate = targetDates[h - 1];

      const rawX  = buildInferenceVector(ts, h, targetDate, stateAverages.get(targetDate) ?? NaN, hooks);
      const x     = imputeVector(rawX, bundle.colMeans);

      const pt  = bundle.point.predict(x);
      const lo  = bundle.lower.predict(x);
      const hi  = bundle.upper.predict(x);

      // Ensure lower ≤ point ≤ upper (quantile crossing correction)
      results.push({
        date: targetDate,
        horizon_days: h,
        point: Math.round(pt  * 100) / 100,
        lower: Math.round(Math.min(lo, pt) * 100) / 100,
        upper: Math.round(Math.max(hi, pt) * 100) / 100,
      });
    }

    return results;
  }

  explain(latestPrice: number | null): ModelExplanation {
    const nonNull = this.ts?.points.filter((p) => p.modal_price !== null) ?? [];
    const n = nonNull.length;
    const dates = nonNull.map((p) => p.date);

    // Normalize importances to sum to 1
    const totalImp = this.globalImportances.reduce((s, v) => s + v, 0);
    const normImps: FeatureImportance[] = this.globalImportances
      .map((imp, fi) => ({
        feature_name: FEATURE_NAMES[fi],
        importance: totalImp > 0 ? Math.round((imp / totalImp) * 1000) / 1000 : 0,
        direction: 'positive' as const, // conservative; direction analysis is additive
      }))
      .filter((f) => f.importance > 0.005)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 8);

    // Estimate error band from h=1 bundle if available
    let errorBand: number | null = null;
    if (latestPrice && latestPrice > 0 && this.bundles.has(1)) {
      // Rough estimate: width of the prediction interval at latest point as % of price
      // (proper backtest error is computed by the backtester)
      errorBand = null; // filled in by backtester results
    }

    return {
      model_family: this.family,
      model_id: this.id,
      top_features: normImps,
      parameters: {
        n_estimators: N_ESTIMATORS,
        learning_rate: LEARNING_RATE,
        max_depth: MAX_DEPTH,
        min_samples_leaf: MIN_LEAF,
        horizons_trained: this.bundles.size,
      },
      recent_error_band: errorBand,
      anomaly_flags: [],
      data_summary: {
        n_real_points: n,
        date_range: n ? [dates[0], dates[n - 1]] : null,
        has_gaps: false,
        missing_ratio: 0,
      },
    };
  }
}
