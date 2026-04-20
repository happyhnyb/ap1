import type {
  TimeSeries,
  ForecastPoint,
  ModelExplanation,
  FeatureImportance,
} from '../../schema/types';
import type { ForecastModel, PredictOptions } from '../interface';
import {
  getObservedPoints,
  forecastDatesFromSeries,
  robustResidualScale,
  intervalHalfWidth,
  boundedForecastPoint,
} from '../utils';

const INPUT_FEATURE_NAMES = [
  'price_z',
  'delta1_z',
  'delta7_z',
  'roll7_mean_z',
  'roll7_std_z',
  'dow_sin',
  'dow_cos',
  'month_sin',
  'month_cos',
] as const;

const INPUT_SIZE = INPUT_FEATURE_NAMES.length;
const HIDDEN_SIZE = 8;
const EPOCHS = 36;
const LEARNING_RATE = 0.01;
const WEIGHT_DECAY = 0.0005;
const GRAD_CLIP = 4;

type Parameters = {
  Wz: number[][];
  Wr: number[][];
  Wh: number[][];
  Uz: number[][];
  Ur: number[][];
  Uh: number[][];
  bz: number[];
  br: number[];
  bh: number[];
  Wy: number[];
  by: number;
};

type StepState = {
  x: number[];
  hPrev: number[];
  z: number[];
  r: number[];
  n: number[];
  h: number[];
  y: number;
};

function zeros(length: number): number[] {
  return new Array<number>(length).fill(0);
}

function zeroMatrix(rows: number, columns: number): number[][] {
  return Array.from({ length: rows }, () => zeros(columns));
}

function cloneParams(params: Parameters): Parameters {
  return {
    Wz: params.Wz.map((row) => [...row]),
    Wr: params.Wr.map((row) => [...row]),
    Wh: params.Wh.map((row) => [...row]),
    Uz: params.Uz.map((row) => [...row]),
    Ur: params.Ur.map((row) => [...row]),
    Uh: params.Uh.map((row) => [...row]),
    bz: [...params.bz],
    br: [...params.br],
    bh: [...params.bh],
    Wy: [...params.Wy],
    by: params.by,
  };
}

function makeParams(): Parameters {
  const seeded = (row: number, column: number, scale: number) =>
    Math.sin((row + 1) * 97 + (column + 1) * 131) * scale;

  return {
    Wz: Array.from({ length: HIDDEN_SIZE }, (_, row) =>
      Array.from({ length: INPUT_SIZE }, (_, column) => seeded(row, column, 0.08))),
    Wr: Array.from({ length: HIDDEN_SIZE }, (_, row) =>
      Array.from({ length: INPUT_SIZE }, (_, column) => seeded(row + 3, column + 5, 0.08))),
    Wh: Array.from({ length: HIDDEN_SIZE }, (_, row) =>
      Array.from({ length: INPUT_SIZE }, (_, column) => seeded(row + 7, column + 11, 0.08))),
    Uz: Array.from({ length: HIDDEN_SIZE }, (_, row) =>
      Array.from({ length: HIDDEN_SIZE }, (_, column) => seeded(row + 13, column + 17, 0.05))),
    Ur: Array.from({ length: HIDDEN_SIZE }, (_, row) =>
      Array.from({ length: HIDDEN_SIZE }, (_, column) => seeded(row + 19, column + 23, 0.05))),
    Uh: Array.from({ length: HIDDEN_SIZE }, (_, row) =>
      Array.from({ length: HIDDEN_SIZE }, (_, column) => seeded(row + 29, column + 31, 0.05))),
    bz: zeros(HIDDEN_SIZE),
    br: zeros(HIDDEN_SIZE),
    bh: zeros(HIDDEN_SIZE),
    Wy: Array.from({ length: HIDDEN_SIZE }, (_, index) => seeded(index + 37, index + 41, 0.1)),
    by: 0,
  };
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function dot(left: number[], right: number[]): number {
  let sum = 0;
  for (let index = 0; index < left.length; index++) sum += left[index] * right[index];
  return sum;
}

function matVec(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => dot(row, vector));
}

function addVec(left: number[], right: number[]): number[] {
  return left.map((value, index) => value + right[index]);
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function sampleStd(values: number[]): number {
  if (values.length < 2) return 1;
  const mu = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - mu) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(variance, 1e-9));
}

function calendarFeatures(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const dow = date.getUTCDay();
  const month = date.getUTCMonth() + 1;
  return {
    dowSin: Math.sin((2 * Math.PI * dow) / 7),
    dowCos: Math.cos((2 * Math.PI * dow) / 7),
    monthSin: Math.sin((2 * Math.PI * month) / 12),
    monthCos: Math.cos((2 * Math.PI * month) / 12),
  };
}

function buildInput(history: number[], targetDate: string): number[] {
  const priceZ = history.at(-1) ?? 0;
  const prev = history.at(-2) ?? priceZ;
  const lag7 = history.at(-8) ?? prev;
  const recent = history.slice(-7);
  const rollMean = recent.length ? mean(recent) : priceZ;
  const rollStd = recent.length > 1 ? sampleStd(recent) : 0;
  const { dowSin, dowCos, monthSin, monthCos } = calendarFeatures(targetDate);

  return [
    priceZ,
    priceZ - prev,
    priceZ - lag7,
    rollMean,
    rollStd,
    dowSin,
    dowCos,
    monthSin,
    monthCos,
  ];
}

function forwardStep(params: Parameters, x: number[], hPrev: number[]): StepState {
  const preZ = addVec(addVec(matVec(params.Wz, x), matVec(params.Uz, hPrev)), params.bz);
  const preR = addVec(addVec(matVec(params.Wr, x), matVec(params.Ur, hPrev)), params.br);
  const z = preZ.map(sigmoid);
  const r = preR.map(sigmoid);

  const gatedPrev = hPrev.map((value, index) => value * r[index]);
  const preN = addVec(addVec(matVec(params.Wh, x), matVec(params.Uh, gatedPrev)), params.bh);
  const n = preN.map((value) => Math.tanh(value));
  const h = hPrev.map((value, index) => z[index] * value + (1 - z[index]) * n[index]);
  const y = dot(params.Wy, h) + params.by;

  return { x, hPrev, z, r, n, h, y };
}

function clampGradient(value: number): number {
  return Math.max(-GRAD_CLIP, Math.min(GRAD_CLIP, value));
}

export class GRUSequenceModel implements ForecastModel {
  readonly id = 'gru_seq';
  readonly name = 'GRU Sequence Model';
  readonly family = 'GRU Sequence';
  readonly minDataPoints = 35;

  private params = makeParams();
  private fitted = false;
  private mean = 0;
  private std = 1;
  private dates: string[] = [];
  private prices: number[] = [];
  private normalized: number[] = [];
  private residualScale = 0;
  private featureImportances = new Array<number>(INPUT_SIZE).fill(0);

  fit(ts: TimeSeries): boolean {
    const observed = getObservedPoints(ts);
    if (observed.length < this.minDataPoints) {
      this.fitted = false;
      return false;
    }

    this.dates = observed.map((point) => point.date);
    this.prices = observed.map((point) => point.price);
    this.mean = mean(this.prices);
    this.std = Math.max(sampleStd(this.prices), 1);
    this.normalized = this.prices.map((price) => (price - this.mean) / this.std);
    this.params = makeParams();
    this.featureImportances.fill(0);

    const steps = this.normalized.length - 1;
    if (steps < 12) {
      this.fitted = false;
      return false;
    }

    for (let epoch = 0; epoch < EPOCHS; epoch++) {
      const grad = cloneParams({
        Wz: zeroMatrix(HIDDEN_SIZE, INPUT_SIZE),
        Wr: zeroMatrix(HIDDEN_SIZE, INPUT_SIZE),
        Wh: zeroMatrix(HIDDEN_SIZE, INPUT_SIZE),
        Uz: zeroMatrix(HIDDEN_SIZE, HIDDEN_SIZE),
        Ur: zeroMatrix(HIDDEN_SIZE, HIDDEN_SIZE),
        Uh: zeroMatrix(HIDDEN_SIZE, HIDDEN_SIZE),
        bz: zeros(HIDDEN_SIZE),
        br: zeros(HIDDEN_SIZE),
        bh: zeros(HIDDEN_SIZE),
        Wy: zeros(HIDDEN_SIZE),
        by: 0,
      });

      const states: StepState[] = [];
      let hPrev = zeros(HIDDEN_SIZE);

      for (let index = 0; index < steps; index++) {
        const targetDate = this.dates[index + 1];
        const x = buildInput(this.normalized.slice(0, index + 1), targetDate);
        const state = forwardStep(this.params, x, hPrev);
        states.push(state);
        hPrev = state.h;
      }

      let dhNext = zeros(HIDDEN_SIZE);

      for (let index = steps - 1; index >= 0; index--) {
        const state = states[index];
        const target = this.normalized[index + 1];
        const err = state.y - target;

        for (let hidden = 0; hidden < HIDDEN_SIZE; hidden++) {
          grad.Wy[hidden] += err * state.h[hidden];
        }
        grad.by += err;

        const dh = this.params.Wy.map((weight, hidden) => weight * err + dhNext[hidden]);
        const dz = dh.map((value, hidden) => value * (state.hPrev[hidden] - state.n[hidden]));
        const dn = dh.map((value, hidden) => value * (1 - state.z[hidden]));
        const dhPrev = dh.map((value, hidden) => value * state.z[hidden]);

        const da = dn.map((value, hidden) => value * (1 - state.n[hidden] ** 2));
        for (let row = 0; row < HIDDEN_SIZE; row++) {
          grad.bh[row] += da[row];
          for (let column = 0; column < INPUT_SIZE; column++) {
            grad.Wh[row][column] += da[row] * state.x[column];
          }
        }

        const dq = zeros(HIDDEN_SIZE);
        for (let row = 0; row < HIDDEN_SIZE; row++) {
          for (let column = 0; column < HIDDEN_SIZE; column++) {
            grad.Uh[row][column] += da[row] * state.r[column] * state.hPrev[column];
            dq[column] += this.params.Uh[row][column] * da[row];
          }
        }

        const dr = dq.map((value, hidden) => value * state.hPrev[hidden]);
        for (let hidden = 0; hidden < HIDDEN_SIZE; hidden++) {
          dhPrev[hidden] += dq[hidden] * state.r[hidden];
        }

        const drPre = dr.map((value, hidden) => value * state.r[hidden] * (1 - state.r[hidden]));
        for (let row = 0; row < HIDDEN_SIZE; row++) {
          grad.br[row] += drPre[row];
          for (let column = 0; column < INPUT_SIZE; column++) {
            grad.Wr[row][column] += drPre[row] * state.x[column];
          }
          for (let column = 0; column < HIDDEN_SIZE; column++) {
            grad.Ur[row][column] += drPre[row] * state.hPrev[column];
            dhPrev[column] += this.params.Ur[row][column] * drPre[row];
          }
        }

        const dzPre = dz.map((value, hidden) => value * state.z[hidden] * (1 - state.z[hidden]));
        for (let row = 0; row < HIDDEN_SIZE; row++) {
          grad.bz[row] += dzPre[row];
          for (let column = 0; column < INPUT_SIZE; column++) {
            grad.Wz[row][column] += dzPre[row] * state.x[column];
          }
          for (let column = 0; column < HIDDEN_SIZE; column++) {
            grad.Uz[row][column] += dzPre[row] * state.hPrev[column];
            dhPrev[column] += this.params.Uz[row][column] * dzPre[row];
          }
        }

        dhNext = dhPrev;
      }

      const scale = Math.max(steps, 1);
      const rate = LEARNING_RATE * (1 - epoch / (EPOCHS * 1.15));
      for (let row = 0; row < HIDDEN_SIZE; row++) {
        this.params.bz[row] -= rate * clampGradient(grad.bz[row] / scale);
        this.params.br[row] -= rate * clampGradient(grad.br[row] / scale);
        this.params.bh[row] -= rate * clampGradient(grad.bh[row] / scale);
        this.params.Wy[row] -= rate * clampGradient(grad.Wy[row] / scale + WEIGHT_DECAY * this.params.Wy[row]);

        for (let column = 0; column < INPUT_SIZE; column++) {
          this.params.Wz[row][column] -= rate * clampGradient(grad.Wz[row][column] / scale + WEIGHT_DECAY * this.params.Wz[row][column]);
          this.params.Wr[row][column] -= rate * clampGradient(grad.Wr[row][column] / scale + WEIGHT_DECAY * this.params.Wr[row][column]);
          this.params.Wh[row][column] -= rate * clampGradient(grad.Wh[row][column] / scale + WEIGHT_DECAY * this.params.Wh[row][column]);
        }

        for (let column = 0; column < HIDDEN_SIZE; column++) {
          this.params.Uz[row][column] -= rate * clampGradient(grad.Uz[row][column] / scale + WEIGHT_DECAY * this.params.Uz[row][column]);
          this.params.Ur[row][column] -= rate * clampGradient(grad.Ur[row][column] / scale + WEIGHT_DECAY * this.params.Ur[row][column]);
          this.params.Uh[row][column] -= rate * clampGradient(grad.Uh[row][column] / scale + WEIGHT_DECAY * this.params.Uh[row][column]);
        }
      }
      this.params.by -= rate * clampGradient(grad.by / scale);
    }

    const residuals: number[] = [];
    let hPrev = zeros(HIDDEN_SIZE);
    for (let index = 0; index < steps; index++) {
      const targetDate = this.dates[index + 1];
      const state = forwardStep(this.params, buildInput(this.normalized.slice(0, index + 1), targetDate), hPrev);
      const predicted = state.y * this.std + this.mean;
      residuals.push(this.prices[index + 1] - predicted);
      hPrev = state.h;
    }

    this.residualScale = Math.max(robustResidualScale(residuals), this.std * 0.08);
    this.featureImportances = INPUT_FEATURE_NAMES.map((_, featureIndex) => {
      let total = 0;
      for (let hidden = 0; hidden < HIDDEN_SIZE; hidden++) {
        total += Math.abs(this.params.Wz[hidden][featureIndex]);
        total += Math.abs(this.params.Wr[hidden][featureIndex]);
        total += Math.abs(this.params.Wh[hidden][featureIndex]);
      }
      return total;
    });

    this.fitted = true;
    return true;
  }

  predict(ts: TimeSeries, opts: PredictOptions): ForecastPoint[] {
    if (!this.fitted || !this.prices.length) return [];

    const targetDates = forecastDatesFromSeries(ts, opts.horizon);
    const history = [...this.normalized];
    const generatedPrices = [...this.prices];
    let hPrev = zeros(HIDDEN_SIZE);

    for (let index = 0; index < this.normalized.length; index++) {
      const nextDate = index + 1 < this.dates.length ? this.dates[index + 1] : targetDates[0];
      const state = forwardStep(this.params, buildInput(history.slice(0, index + 1), nextDate), hPrev);
      hPrev = state.h;
    }

    return targetDates.map((targetDate, index) => {
      const state = forwardStep(this.params, buildInput(history, targetDate), hPrev);
      hPrev = state.h;
      history.push(state.y);
      const point = Math.max(0, state.y * this.std + this.mean);
      generatedPrices.push(point);
      return boundedForecastPoint(
        point,
        intervalHalfWidth(this.residualScale, generatedPrices, index + 1, ts, 1.18),
        targetDate,
        index + 1,
      );
    });
  }

  explain(latestPrice: number | null): ModelExplanation {
    const totalImportance = this.featureImportances.reduce((sum, value) => sum + value, 0) || 1;
    const topFeatures: FeatureImportance[] = INPUT_FEATURE_NAMES
      .map((featureName, index) => ({
        feature_name: featureName,
        importance: Math.round((this.featureImportances[index] / totalImportance) * 1000) / 1000,
        direction: featureName.includes('delta') ? 'mixed' as const : 'positive' as const,
      }))
      .filter((feature) => feature.importance > 0.03)
      .sort((left, right) => right.importance - left.importance)
      .slice(0, 6);

    return {
      model_family: this.family,
      model_id: this.id,
      top_features: topFeatures,
      parameters: {
        hidden_size: HIDDEN_SIZE,
        epochs: EPOCHS,
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
