export function calculateLeadTime(
  createTime: Date,
  deployTime: Date,
  unit: 'hours' | 'days' = 'hours',
): number {
  const diffMs = deployTime.getTime() - createTime.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return unit === 'days' ? diffHours / 24 : diffHours;
}

export function calcFOvertime(overtimeCommits: number, totalCommits: number): number {
  if (totalCommits === 0) return 0;
  return overtimeCommits / totalCommits;
}

export function calcFContext(nBranches: number): number {
  if (nBranches <= 1) return 0;
  return Math.min(1, (nBranches - 1) / 3);
}

export function calcFChurn(avgLinesPerCommit: number): number {
  return Math.min(1, avgLinesPerCommit / 500);
}

export function calculateBurnoutIndex(
  fOvertime: number,
  fContext: number,
  fChurn: number,
): number {
  const bi = 0.4 * fOvertime + 0.3 * fContext + 0.3 * fChurn;
  return Math.min(1, Math.max(0, Number(bi.toFixed(4))));
}

export function calculateBurnoutIndexExtended(
  fOvertime: number,
  fContext: number,
  fChurn: number,
  fBottleneck: number,
): number {
  const bi =
    0.35 * fOvertime +
    0.25 * fContext +
    0.20 * fChurn +
    0.20 * fBottleneck;
  return Math.min(1, Math.max(0, Number(bi.toFixed(4))));
}

export function getBurnoutRiskLevel(bi: number): 'SAFE' | 'WARNING' | 'CRITICAL' {
  if (bi >= 0.6) return 'CRITICAL';
  if (bi >= 0.3) return 'WARNING';
  return 'SAFE';
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

export function calculateEdgeWeight(nPR: number, nComments: number): number {
  return 1.0 * nPR + 0.1 * nComments;
}

export function calculateInDegree(nodeId: string, edges: GraphEdge[]): number {
  return edges
    .filter((e) => e.target === nodeId)
    .reduce((sum, e) => sum + e.weight, 0);
}

export function calculateOutDegree(nodeId: string, edges: GraphEdge[]): number {
  return edges
    .filter((e) => e.source === nodeId)
    .reduce((sum, e) => sum + e.weight, 0);
}

export function calculateBottleneckScore(
  outDegree: number,
  nReviewers: number,
  nTotalDevs: number,
): number {
  if (nTotalDevs === 0) return 0;
  const ratio = nReviewers / nTotalDevs;
  return Number((outDegree * (1 - ratio)).toFixed(4));
}

export function normalizeBottleneckScore(score: number, maxScore: number): number {
  if (maxScore === 0) return 0;
  return Math.min(1, score / maxScore);
}

export function calculateBusFactor(devOutDegrees: Map<string, number>): number {
  const values = Array.from(devOutDegrees.values()).sort((a, b) => b - a);
  const total = values.reduce((s, v) => s + v, 0);

  if (total === 0) return 0;

  const threshold = total * 0.8;
  let cumulative = 0;

  for (let i = 0; i < values.length; i++) {
    cumulative += values[i];
    if (cumulative >= threshold) return i + 1;
  }

  return values.length;
}

export function transposeMatrix(matrix: number[][]): number[][] {
  if (matrix.length === 0) return [];
  return matrix[0].map((_, colIdx) => matrix.map((row) => row[colIdx]));
}

export function multiplyMatrices(A: number[][], B: number[][]): number[][] {
  const rowsA = A.length;
  const colsA = A[0].length;
  const colsB = B[0].length;
  const result: number[][] = Array.from({ length: rowsA }, () =>
    new Array(colsB).fill(0),
  );
  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      for (let k = 0; k < colsA; k++) {
        result[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return result;
}

export function invertMatrix(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const augmented = matrix.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[maxRow][col])) {
        maxRow = row;
      }
    }
    [augmented[col], augmented[maxRow]] = [augmented[maxRow], augmented[col]];

    const pivot = augmented[col][col];
    if (Math.abs(pivot) < 1e-10) return null;

    for (let j = 0; j < 2 * n; j++) augmented[col][j] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row !== col) {
        const factor = augmented[row][col];
        for (let j = 0; j < 2 * n; j++) {
          augmented[row][j] -= factor * augmented[col][j];
        }
      }
    }
  }

  return augmented.map((row) => row.slice(n));
}

export function fitOLS(X: number[][], y: number[]): number[] | null {
  if (X.length < X[0].length) return null;

  const Xt = transposeMatrix(X);
  const XtX = multiplyMatrices(Xt, X);
  const XtXinv = invertMatrix(XtX);
  if (!XtXinv) return null;

  const Xty = multiplyMatrices(Xt, y.map((v) => [v]));
  const beta = multiplyMatrices(XtXinv, Xty);
  return beta.map((row) => row[0]);
}

export function fitRidge(
  X: number[][],
  y: number[],
  lambda: number = 0.1,
): number[] {
  const p = X[0].length;

  const Xt = transposeMatrix(X);
  const XtX = multiplyMatrices(Xt, X);

  for (let i = 1; i < p; i++) {
    XtX[i][i] += lambda;
  }

  const XtXinv = invertMatrix(XtX);
  if (!XtXinv) {
    return new Array(p).fill(0);
  }

  const Xty = multiplyMatrices(Xt, y.map((v) => [v]));
  const beta = multiplyMatrices(XtXinv, Xty);
  return beta.map((row) => row[0]);
}

export function predictOLS(X: number[][], beta: number[]): number[] {
  return X.map((row) => row.reduce((sum, xi, i) => sum + xi * beta[i], 0));
}

export function calculateRSquared(yTrue: number[], yPred: number[]): number {
  const yMean = yTrue.reduce((s, v) => s + v, 0) / yTrue.length;
  const ssTot = yTrue.reduce((s, v) => s + (v - yMean) ** 2, 0);
  const ssRes = yTrue.reduce((s, v, i) => s + (v - yPred[i]) ** 2, 0);
  if (ssTot === 0) return 1;
  return Number(Math.max(0, 1 - ssRes / ssTot).toFixed(4));
}
