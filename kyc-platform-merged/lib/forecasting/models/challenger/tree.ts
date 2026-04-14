/**
 * Regression Decision Tree — pure TypeScript implementation.
 *
 * Used as the weak learner inside GBRT. Supports two leaf-value modes:
 *   - 'mean':     standard regression tree (MSE split + mean leaf)
 *   - 'quantile': quantile regression (MSE split + τ-quantile leaf, Friedman 2001)
 *
 * Split criterion: maximize variance reduction (= minimize weighted child MSE).
 * Uses prefix-sum trick for O(n) scan per feature after O(n log n) sort.
 *
 * Feature importances are accumulated during fitting as:
 *   importance[f] += gain × n_samples_at_node  (Gini-like gain importance)
 */

export interface TreeNode {
  isLeaf: boolean;
  value: number;           // leaf prediction or fallback for internal nodes
  featureIndex: number;    // split feature (-1 for leaves)
  splitValue: number;      // threshold
  left:  TreeNode | null;
  right: TreeNode | null;
  n: number;               // samples reaching this node
}

export interface RegressionTreeOptions {
  maxDepth?: number;
  minSamplesLeaf?: number;
  leafMode?: 'mean' | 'quantile';
  tau?: number;             // quantile (0–1), used when leafMode === 'quantile'
}

const DEFAULTS: Required<RegressionTreeOptions> = {
  maxDepth: 4,
  minSamplesLeaf: 5,
  leafMode: 'mean',
  tau: 0.5,
};

// ── Numeric helpers ───────────────────────────────────────────────────────────

function mean(y: number[]): number {
  if (!y.length) return 0;
  return y.reduce((s, v) => s + v, 0) / y.length;
}

function quantile(y: number[], tau: number): number {
  if (!y.length) return 0;
  const sorted = [...y].sort((a, b) => a - b);
  const idx = tau * (sorted.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

// ── Tree building ─────────────────────────────────────────────────────────────

/**
 * Find the best split for a set of samples.
 * splitTargets: used for split criterion (pseudo-residuals for quantile GBRT)
 * leafTargets:  actual residuals used only for leaf value computation
 *
 * Returns null if no beneficial split exists.
 */
function findBestSplit(
  X: number[][],
  splitTargets: number[],
  minLeaf: number,
): { featureIndex: number; splitValue: number; gain: number; leftIdx: number[]; rightIdx: number[] } | null {
  const n = splitTargets.length;
  if (n < 2 * minLeaf) return null;

  const nFeatures = X[0]?.length ?? 0;
  const totalMean = mean(splitTargets);
  const totalVar  = splitTargets.reduce((s, v) => s + (v - totalMean) ** 2, 0);

  let bestGain = 1e-10; // minimum threshold to avoid trivial splits
  let bestFeature = -1;
  let bestThreshold = 0;
  let bestLeftIdx: number[] = [];
  let bestRightIdx: number[] = [];

  for (let f = 0; f < nFeatures; f++) {
    // Build sorted index by feature value (skip NaN)
    const sortedIdx = Array.from({ length: n }, (_, i) => i)
      .filter((i) => Number.isFinite(X[i][f]))
      .sort((a, b) => X[a][f] - X[b][f]);

    const m = sortedIdx.length;
    if (m < 2 * minLeaf) continue;

    // Prefix sums for O(n) variance computation
    const pSum   = new Array<number>(m + 1).fill(0);
    const pSumSq = new Array<number>(m + 1).fill(0);
    for (let i = 0; i < m; i++) {
      pSum[i + 1]   = pSum[i]   + splitTargets[sortedIdx[i]];
      pSumSq[i + 1] = pSumSq[i] + splitTargets[sortedIdx[i]] ** 2;
    }

    for (let split = minLeaf; split <= m - minLeaf; split++) {
      // Skip if same feature value as previous (avoid duplicate thresholds)
      if (X[sortedIdx[split]][f] === X[sortedIdx[split - 1]][f]) continue;

      const lN    = split;
      const rN    = m - split;
      const lMean = pSum[split]   / lN;
      const rMean = (pSum[m] - pSum[split]) / rN;
      const lVar  = pSumSq[split]   / lN - lMean ** 2;
      const rVar  = (pSumSq[m] - pSumSq[split]) / rN - rMean ** 2;

      // Variance reduction gain
      const gain = totalVar / n - (lN * lVar + rN * rVar) / n;

      if (gain > bestGain) {
        bestGain      = gain;
        bestFeature   = f;
        bestThreshold = (X[sortedIdx[split - 1]][f] + X[sortedIdx[split]][f]) / 2;
        bestLeftIdx   = sortedIdx.slice(0, split);
        bestRightIdx  = sortedIdx.slice(split);

        // Include NaN samples in the right branch (XGBoost convention: NaN → larger)
        const nanIdx = Array.from({ length: n }, (_, i) => i).filter((i) => !Number.isFinite(X[i][f]));
        if (nanIdx.length) bestRightIdx = [...bestRightIdx, ...nanIdx];
      }
    }
  }

  if (bestFeature === -1) return null;

  return {
    featureIndex: bestFeature,
    splitValue:   bestThreshold,
    gain:         bestGain,
    leftIdx:      bestLeftIdx,
    rightIdx:     bestRightIdx,
  };
}

function buildNode(
  X: number[][],
  splitTargets: number[],
  leafTargets: number[],
  depth: number,
  opts: Required<RegressionTreeOptions>,
  importances: number[],
): TreeNode {
  const n = splitTargets.length;

  const leafValue = opts.leafMode === 'quantile'
    ? quantile(leafTargets, opts.tau)
    : mean(leafTargets);

  // Stopping conditions
  if (depth >= opts.maxDepth || n < 2 * opts.minSamplesLeaf) {
    return { isLeaf: true, value: leafValue, featureIndex: -1, splitValue: 0, left: null, right: null, n };
  }

  const split = findBestSplit(X, splitTargets, opts.minSamplesLeaf);
  if (!split) {
    return { isLeaf: true, value: leafValue, featureIndex: -1, splitValue: 0, left: null, right: null, n };
  }

  // Accumulate feature importance: gain × samples
  importances[split.featureIndex] += split.gain * n;

  const leftNode = buildNode(
    split.leftIdx.map((i) => X[i]),
    split.leftIdx.map((i) => splitTargets[i]),
    split.leftIdx.map((i) => leafTargets[i]),
    depth + 1, opts, importances,
  );
  const rightNode = buildNode(
    split.rightIdx.map((i) => X[i]),
    split.rightIdx.map((i) => splitTargets[i]),
    split.rightIdx.map((i) => leafTargets[i]),
    depth + 1, opts, importances,
  );

  return {
    isLeaf: false,
    value: leafValue,
    featureIndex: split.featureIndex,
    splitValue: split.splitValue,
    left:  leftNode,
    right: rightNode,
    n,
  };
}

function predictNode(node: TreeNode, x: number[]): number {
  if (node.isLeaf) return node.value;
  const fv = x[node.featureIndex];
  // NaN or missing → go right (larger branch, XGBoost convention)
  if (!Number.isFinite(fv) || fv > node.splitValue) {
    return predictNode(node.right!, x);
  }
  return predictNode(node.left!, x);
}

// ── Public class ──────────────────────────────────────────────────────────────

export class RegressionTree {
  root: TreeNode | null = null;
  featureImportances: number[] = [];
  private opts: Required<RegressionTreeOptions>;

  constructor(opts: RegressionTreeOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  /**
   * Fit the tree.
   * @param X             Feature matrix [n × p] (NaN allowed)
   * @param splitTargets  Values used for split criterion (e.g. pseudo-residuals)
   * @param leafTargets   Values used for leaf estimates (same as splitTargets for MSE)
   */
  fit(X: number[][], splitTargets: number[], leafTargets?: number[]): void {
    const nFeatures = X[0]?.length ?? 0;
    this.featureImportances = new Array<number>(nFeatures).fill(0);
    this.root = buildNode(
      X,
      splitTargets,
      leafTargets ?? splitTargets,
      0,
      this.opts,
      this.featureImportances,
    );
  }

  predict(x: number[]): number {
    return this.root ? predictNode(this.root, x) : 0;
  }

  predictAll(X: number[][]): number[] {
    return X.map((x) => this.predict(x));
  }
}
