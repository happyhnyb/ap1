import type {
  TimeSeries,
  ForecastPoint,
  ModelExplanation,
  FeatureImportance,
} from '../../schema/types';
import type { ForecastModel, PredictOptions } from '../interface';
import {
  getObservedPoints,
  intervalHalfWidth,
  forecastDatesFromSeries,
  robustResidualScale,
  boundedForecastPoint,
} from '../utils';

const FEATURE_NAMES = [
  'bias',
  'lag_1',
  'lag_2',
  'lag_7',
  'lag_14',
  'delta_1',
  'delta_7',
  'roll7_mean',
  'roll14_mean',
  'month_sin',
  'month_cos',
  'dow_sin',
  'dow_cos',
] as const;

const MIN_TRAIN_ROWS = 18;
const RIDGE_GRID = [0.1, 1, 5, 10];

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStd(values: number[]): number {
  if (values.length < 2) return 1;
  const mu = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - mu) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(variance, 1e-9));
}

function weekFeature(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  const dow = date.getUTCDay();
  const month = date.getUTCMonth() + 1;
  return {
    dowSin: Math.sin((2 * Math.PI * dow) / 7),
    dowCos: Math.cos((2 * Math.PI * dow) / 7),
    monthSin: Math.sin((2 * Math.PI * month) / 12),
    monthCos: Math.cos((2 * Math.PI * month) / 12),
  };
}

function rollingMean(values: number[], window: number): number {
  const slice = values.slice(-window);
  return mean(slice);
}

function buildRow(values: number[], targetDate: string): number[] | null {
  if (values.length < 15) return null;
  const lag1 = values.at(-1)!;
  const lag2 = values.at(-2)!;
  const lag7 = values.at(-7)!;
  const lag14 = values.at(-14)!;
  const { dowSin, dowCos, monthSin, monthCos } = weekFeature(targetDate);

  return [
    1,
    lag1,
    lag2,
    lag7,
    lag14,
    lag1 - lag2,
    lag1 - lag7,
    rollingMean(values, 7),
    rollingMean(values, 14),
    monthSin,
    monthCos,
    dowSin,
    dowCos,
  ];
}

function buildTrainingSet(prices: number[], dates: string[]) {
  const X: number[][] = [];
  const y: number[] = [];

  for (let index = 14; index < prices.length; index++) {
    const features = buildRow(prices.slice(0, index), dates[index]);
    if (!features) continue;
    X.push(features);
    y.push(prices[index]);
  }

  return { X, y };
}

function zScoreColumns(X: number[][]) {
  const columnMeans = X[0].map((_, column) => mean(X.map((row) => row[column])));
  const columnStds = X[0].map((_, column) => sampleStd(X.map((row) => row[column])));
  const scaled = X.map((row) => row.map((value, column) => (value - columnMeans[column]) / columnStds[column]));
  return { scaled, columnMeans, columnStds };
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let pivot = 0; pivot < n; pivot++) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < n; row++) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[maxRow][pivot])) maxRow = row;
    }

    if (Math.abs(augmented[maxRow][pivot]) < 1e-8) continue;
    [augmented[pivot], augmented[maxRow]] = [augmented[maxRow], augmented[pivot]];

    const divisor = augmented[pivot][pivot];
    for (let column = pivot; column <= n; column++) augmented[pivot][column] /= divisor;

    for (let row = 0; row < n; row++) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      for (let column = pivot; column <= n; column++) {
        augmented[row][column] -= factor * augmented[pivot][column];
      }
    }
  }

  return augmented.map((row) => row[n] ?? 0);
}

function fitRidge(X: number[][], y: number[], lambda: number): number[] {
  const nFeatures = X[0]?.length ?? 0;
  const xtx = Array.from({ length: nFeatures }, () => new Array<number>(nFeatures).fill(0));
  const xty = new Array<number>(nFeatures).fill(0);

  for (let row = 0; row < X.length; row++) {
    for (let i = 0; i < nFeatures; i++) {
      xty[i] += X[row][i] * y[row];
      for (let j = 0; j < nFeatures; j++) xtx[i][j] += X[row][i] * X[row][j];
    }
  }

  for (let i = 0; i < nFeatures; i++) xtx[i][i] += lambda;
  return solveLinearSystem(xtx, xty);
}

function predictRow(coefficients: number[], row: number[]): number {
  return coefficients.reduce((sum, coefficient, index) => sum + coefficient * row[index], 0);
}

function chooseLambda(X: number[][], y: number[]): number {
  if (X.length < MIN_TRAIN_ROWS) return RIDGE_GRID[0];

  const split = Math.max(MIN_TRAIN_ROWS, Math.floor(X.length * 0.8));
  const trainX = X.slice(0, split);
  const trainY = y.slice(0, split);
  const validX = X.slice(split);
  const validY = y.slice(split);
  if (!validX.length) return RIDGE_GRID[0];

  let bestLambda = RIDGE_GRID[0];
  let bestMae = Infinity;

  for (const lambda of RIDGE_GRID) {
    const coefficients = fitRidge(trainX, trainY, lambda);
    const mae = validX.reduce((sum, row, index) => sum + Math.abs(validY[index] - predictRow(coefficients, row)), 0) / validX.length;
    if (mae < bestMae) {
      bestMae = mae;
      bestLambda = lambda;
    }
  }

  return bestLambda;
}

export class SeasonalARModel implements ForecastModel {
  readonly id = 'seasonal_ar';
  readonly name = 'Seasonal AR (ridge)';
  readonly family = 'Seasonal Autoregression';
  readonly minDataPoints = 21;

  private fitted = false;
  private dates: string[] = [];
  private prices: number[] = [];
  private coefficients: number[] = [];
  private columnMeans: number[] = [];
  private columnStds: number[] = [];
  private residualScale = 0;
  private lambda = RIDGE_GRID[0];

  fit(ts: TimeSeries): boolean {
    const observed = getObservedPoints(ts);
    if (observed.length < this.minDataPoints) {
      this.fitted = false;
      return false;
    }

    this.dates = observed.map((point) => point.date);
    this.prices = observed.map((point) => point.price);

    const { X, y } = buildTrainingSet(this.prices, this.dates);
    if (X.length < MIN_TRAIN_ROWS) {
      this.fitted = false;
      return false;
    }

    const { scaled, columnMeans, columnStds } = zScoreColumns(X);
    this.lambda = chooseLambda(scaled, y);
    this.coefficients = fitRidge(scaled, y, this.lambda);
    this.columnMeans = columnMeans;
    this.columnStds = columnStds;

    const residuals = scaled.map((row, index) => y[index] - predictRow(this.coefficients, row));
    this.residualScale = robustResidualScale(residuals);
    this.fitted = true;
    return true;
  }

  predict(ts: TimeSeries, opts: PredictOptions): ForecastPoint[] {
    if (!this.fitted || !this.coefficients.length) return [];

    const rollingPrices = [...this.prices];
    const dates = forecastDatesFromSeries(ts, opts.horizon);

    return dates.map((targetDate, index) => {
      const rawRow = buildRow(rollingPrices, targetDate);
      if (!rawRow) {
        return boundedForecastPoint(rollingPrices.at(-1) ?? 0, intervalHalfWidth(this.residualScale, rollingPrices, index + 1, ts), targetDate, index + 1);
      }

      const scaledRow = rawRow.map((value, column) => (value - this.columnMeans[column]) / this.columnStds[column]);
      const point = Math.max(0, predictRow(this.coefficients, scaledRow));
      rollingPrices.push(point);
      return boundedForecastPoint(
        point,
        intervalHalfWidth(this.residualScale, rollingPrices, index + 1, ts, 1.22),
        targetDate,
        index + 1,
      );
    });
  }

  explain(latestPrice: number | null): ModelExplanation {
    const total = this.coefficients.reduce((sum, value, index) => {
      if (index === 0) return sum;
      return sum + Math.abs(value);
    }, 0) || 1;

    const topFeatures: FeatureImportance[] = FEATURE_NAMES
      .map((featureName, index) => ({
        feature_name: featureName,
        importance: index === 0 ? 0 : Math.abs(this.coefficients[index]) / total,
        direction: this.coefficients[index] > 0 ? 'positive' as const : this.coefficients[index] < 0 ? 'negative' as const : 'mixed' as const,
      }))
      .filter((feature) => feature.importance > 0.02)
      .sort((left, right) => right.importance - left.importance)
      .slice(0, 6);

    return {
      model_family: this.family,
      model_id: this.id,
      top_features: topFeatures,
      parameters: {
        ridge_lambda: this.lambda,
        residual_scale: Math.round(this.residualScale * 100) / 100,
      },
      recent_error_band: latestPrice && latestPrice > 0
        ? Math.round(((this.residualScale / latestPrice) * 100) * 100) / 100
        : null,
      anomaly_flags: [],
      data_summary: {
        n_real_points: this.prices.length,
        date_range: this.dates.length ? [this.dates[0], this.dates.at(-1)!] : null,
        has_gaps: false,
        missing_ratio: 0,
      },
    };
  }
}
