/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  formulas.util.ts — Математичні формули з дипломної роботи
 *  "Система моніторингу метрик процесів SDLC"
 * ══════════════════════════════════════════════════════════════════════════════
 */

// ─── 1. Lead Time ─────────────────────────────────────────────────────────────

/**
 * LT = t_deploy - t_create
 * @returns Час виконання у годинах або днях
 */
export function calculateLeadTime(
  createTime: Date,
  deployTime: Date,
  unit: 'hours' | 'days' = 'hours',
): number {
  const diffMs = deployTime.getTime() - createTime.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return unit === 'days' ? diffHours / 24 : diffHours;
}

// ─── 2. Компоненти Burnout Index ──────────────────────────────────────────────

/**
 * f_overtime — частка комітів у позаробочий час (вихідні АБО 22:00–06:00 UTC)
 * f_overtime = overtimeCommits / totalCommits
 */
export function calcFOvertime(overtimeCommits: number, totalCommits: number): number {
  if (totalCommits === 0) return 0;
  return overtimeCommits / totalCommits;
}

/**
 * f_context — перемикання контексту за кількістю унікальних гілок за 7 днів
 * f_context = min(1, (N_branches - 1) / 3)
 * Якщо N_branches = 1 → f_context = 0 (немає перемикання)
 * Якщо N_branches = 4 → f_context = 1 (максимальне перемикання)
 */
export function calcFContext(nBranches: number): number {
  if (nBranches <= 1) return 0;
  return Math.min(1, (nBranches - 1) / 3);
}

/**
 * f_churn — нормалізований Code Churn розробника
 * f_churn = min(1, avgLinesPerCommit / 500)
 * 500 рядків/коміт вважається максимальним нормальним значенням
 */
export function calcFChurn(avgLinesPerCommit: number): number {
  return Math.min(1, avgLinesPerCommit / 500);
}

// ─── 3. Burnout Index (BI) ────────────────────────────────────────────────────

/**
 * Базова формула (без графових даних):
 * BI = 0.4 * f_overtime + 0.3 * f_context + 0.3 * f_churn
 *
 * Інтерпретація:
 *   BI < 0.3   → SAFE
 *   0.3 ≤ BI < 0.6 → WARNING
 *   BI ≥ 0.6   → CRITICAL
 */
export function calculateBurnoutIndex(
  fOvertime: number,
  fContext: number,
  fChurn: number,
): number {
  const bi = 0.4 * fOvertime + 0.3 * fContext + 0.3 * fChurn;
  return Math.min(1, Math.max(0, Number(bi.toFixed(4))));
}

/**
 * Розширена формула (з графовими даними — f_bottleneck):
 * BI_ext = 0.35 * f_overtime + 0.25 * f_context + 0.20 * f_churn + 0.20 * f_bottleneck
 */
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

/**
 * Визначення рівня ризику за BI
 */
export function getBurnoutRiskLevel(bi: number): 'SAFE' | 'WARNING' | 'CRITICAL' {
  if (bi >= 0.6) return 'CRITICAL';
  if (bi >= 0.3) return 'WARNING';
  return 'SAFE';
}

// ─── 4. Граф взаємодії (Code Review) ─────────────────────────────────────────

/**
 * Тип ребра графа
 */
export interface GraphEdge {
  source: string; // login автора PR
  target: string; // login рев'юера
  weight: number;
}

/**
 * Вага ребра між Автором і Рев'юером:
 * w = 1.0 * N_PR + 0.1 * N_comments
 *
 * @param nPR — кількість PR, які рев'юер переглянув у цього автора
 * @param nComments — кількість коментарів у цих ревю
 */
export function calculateEdgeWeight(nPR: number, nComments: number): number {
  return 1.0 * nPR + 0.1 * nComments;
}

/**
 * In-Degree вузла: сума ваг вхідних ребер (скільки review отримав автор)
 * C_D^in(v_i) = Σ w_ji
 */
export function calculateInDegree(nodeId: string, edges: GraphEdge[]): number {
  return edges
    .filter((e) => e.target === nodeId)
    .reduce((sum, e) => sum + e.weight, 0);
}

/**
 * Out-Degree вузла: сума ваг вихідних ребер (скільки review зробив рев'юер)
 * C_D^out(v_i) = Σ w_ij
 */
export function calculateOutDegree(nodeId: string, edges: GraphEdge[]): number {
  return edges
    .filter((e) => e.source === nodeId)
    .reduce((sum, e) => sum + e.weight, 0);
}

// ─── 5. Bottleneck Score ──────────────────────────────────────────────────────

/**
 * f_bottleneck(v_i) = OutDegree(v_i) * (1 - N_reviewers(v_i) / N_total_devs)
 *
 * Логіка: розробник з високим OutDegree і малою кількістю унікальних рев'юерів
 * є "вузьким місцем" — він робить багато ревю, але сам не отримує feedback.
 *
 * @param outDegree — сума ваг вихідних ребер вузла
 * @param nReviewers — кількість унікальних розробників, яких цей вузол рев'юював
 * @param nTotalDevs — загальна кількість розробників у проекті
 */
export function calculateBottleneckScore(
  outDegree: number,
  nReviewers: number,
  nTotalDevs: number,
): number {
  if (nTotalDevs === 0) return 0;
  const ratio = nReviewers / nTotalDevs;
  return Number((outDegree * (1 - ratio)).toFixed(4));
}

/**
 * Нормалізований f_bottleneck для використання в BI_ext (від 0 до 1)
 * Ділимо на максимальний bottleneck score у команді
 */
export function normalizeBottleneckScore(score: number, maxScore: number): number {
  if (maxScore === 0) return 0;
  return Math.min(1, score / maxScore);
}

// ─── 6. Bus Factor ────────────────────────────────────────────────────────────

/**
 * Bus Factor = мінімальна кількість розробників, чий сумарний OutDegree
 * покриває ≥ 80% всього Code Review активності у проекті.
 *
 * Алгоритм:
 * 1. Сортуємо розробників за OutDegree (спадання)
 * 2. Накопичуємо суму до досягнення 80% від загального OutDegree
 * 3. Повертаємо кількість доданих розробників
 *
 * @param devOutDegrees — Map<login, outDegree>
 */
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

// ─── 7. OLS Лінійна регресія (ручна реалізація) ───────────────────────────────

/**
 * Транспонування матриці
 */
export function transposeMatrix(matrix: number[][]): number[][] {
  if (matrix.length === 0) return [];
  return matrix[0].map((_, colIdx) => matrix.map((row) => row[colIdx]));
}

/**
 * Множення матриць A × B
 */
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

/**
 * Інвертування квадратної матриці методом Гаусса-Жордана
 * Повертає null якщо матриця сингулярна (не можна інвертувати)
 */
export function invertMatrix(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  // Створюємо розширену матрицю [A | I]
  const augmented = matrix.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col++) {
    // Пошук опорного елементу
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[maxRow][col])) {
        maxRow = row;
      }
    }
    [augmented[col], augmented[maxRow]] = [augmented[maxRow], augmented[col]];

    const pivot = augmented[col][col];
    if (Math.abs(pivot) < 1e-10) return null; // сингулярна матриця

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

/**
 * OLS (Ordinary Least Squares) лінійна регресія
 * β = (XᵀX)⁻¹ · Xᵀy
 *
 * @param X — матриця фіч ([колонка 1 для intercept, x1...xp]): [n_samples × (p+1)]
 * @param y — вектор цільових значень: [n_samples]
 * @returns β коефіцієнти або null якщо даних недостатньо або матриця сингулярна
 */
export function fitOLS(X: number[][], y: number[]): number[] | null {
  if (X.length < X[0].length) return null; // n < p — underdetermined

  const Xt = transposeMatrix(X);
  const XtX = multiplyMatrices(Xt, X);
  const XtXinv = invertMatrix(XtX);
  if (!XtXinv) return null;

  const Xty = multiplyMatrices(Xt, y.map((v) => [v]));
  const beta = multiplyMatrices(XtXinv, Xty);
  return beta.map((row) => row[0]);
}

/**
 * Ridge Regression (Гребнева регресія) — Tikhonov regularization
 * β = (XᵀX + λI)⁻¹ · Xᵀy
 *
 * Математично унеможливлює помилку "singular matrix":
 * додавання λI до XtX гарантує, що всі власні значення > λ > 0,
 * тобто матриця завжди обертається. Також придушує мультиколінеарність.
 *
 * @param X — матриця фіч: [n_samples × (p+1)]
 * @param y — вектор цільових значень: [n_samples]
 * @param lambda — параметр регуляризації (default 0.1).
 *               Занадто малий (0.001–1.0). Більші значення — сильніша регуляризація
 *               (коефіцієнти зближуються до 0, але модель стає стабільною).
 * @returns β коефіцієнти — завжди повертає результат (не null)
 */
export function fitRidge(
  X: number[][],
  y: number[],
  lambda: number = 0.1,
): number[] {
  const p = X[0].length; // кількість фіч включно intercept

  const Xt = transposeMatrix(X);
  const XtX = multiplyMatrices(Xt, X);

  // Додаємо λI: збільшуємо діагональні елементи на lambda
  // ВАЖЛИВО: не регуляризуємо intercept (XtX[0][0]), тому починаємо з i=1
  for (let i = 1; i < p; i++) {
    XtX[i][i] += lambda;
  }

  // Тепер матриця завжди обертається
  const XtXinv = invertMatrix(XtX);
  if (!XtXinv) {
    // Якщо навіть Ridge не допомагає (вкрай вироджена матриця),
    // повертаємо нульові коефіцієнти
    return new Array(p).fill(0);
  }

  const Xty = multiplyMatrices(Xt, y.map((v) => [v]));
  const beta = multiplyMatrices(XtXinv, Xty);
  return beta.map((row) => row[0]);
}

/**
 * Прогнозування y = Xβ
 */
export function predictOLS(X: number[][], beta: number[]): number[] {
  return X.map((row) => row.reduce((sum, xi, i) => sum + xi * beta[i], 0));
}

/**
 * R² = 1 - SS_res / SS_tot
 * Міра якості підгонки моделі (1 = ідеальна, 0 = модель не краща за середнє)
 */
export function calculateRSquared(yTrue: number[], yPred: number[]): number {
  const yMean = yTrue.reduce((s, v) => s + v, 0) / yTrue.length;
  const ssTot = yTrue.reduce((s, v) => s + (v - yMean) ** 2, 0);
  const ssRes = yTrue.reduce((s, v, i) => s + (v - yPred[i]) ** 2, 0);
  if (ssTot === 0) return 1;
  return Number(Math.max(0, 1 - ssRes / ssTot).toFixed(4));
}
