// ══════════════════════════════════════════════════════════════════════════════
//  metrics.types.ts — Типи даних для метрик SDLC
//  Відповідає формулам дипломної роботи
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Рівні ризику вигорання (відповідно до дипломної):
 *   BI < 0.3   → SAFE
 *   0.3 ≤ BI < 0.6 → WARNING
 *   BI ≥ 0.6   → CRITICAL
 */
export type BurnoutRiskLevel = 'SAFE' | 'WARNING' | 'CRITICAL';

export interface DeveloperBurnout {
  developerId: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;

  // ─── Базові метрики ───────────────────────────────────────────────────────
  totalCommits: number;
  overtimeCommits: number;  // коміти у вихідні або 22:00–06:00 UTC

  // ─── Компоненти BI ───────────────────────────────────────────────────────
  /** f_overtime = overtimeCommits / totalCommits */
  fOvertime: number;
  /** f_context = min(1, (N_branches - 1) / 3) */
  fContext: number;
  /** f_churn = min(1, avgLinesPerCommit / 500) */
  fChurn: number;
  /** f_bottleneck (нормалізований) = з графової моделі */
  fBottleneck: number;

  // ─── Допоміжні поля (для UI) ─────────────────────────────────────────────
  /** Кількість унікальних гілок за 7 днів (або PR як апроксимація) */
  activeBranches: number;
  /** Avg lines per commit (для відображення в таблиці) */
  avgLinesPerCommit: number;
  /** OutDegree цього розробника в графі (кількість ревю, зроблених іншим) */
  outDegree: number;
  /** Bottleneck Score (raw, до нормалізації) */
  bottleneckScore: number;

  // ─── Підсумок ─────────────────────────────────────────────────────────────
  /** Базовий BI = 0.4*f_overtime + 0.3*f_context + 0.3*f_churn */
  burnoutIndex: number;
  /** Розширений BI з f_bottleneck (якщо є граф) */
  burnoutIndexExtended: number;
  riskLevel: BurnoutRiskLevel;
}

// ─── Граф взаємодії ──────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;          // developer login
  name: string;
  /** 1 = SAFE, 2 = WARNING, 3 = CRITICAL */
  group: number;
  /** Розмір вузла = залежить від OutDegree (review activity) */
  val: number;
  burnout: number;     // BI (впливає на колір)
  outDegree: number;   // сума ваг вихідних ребер
  bottleneckScore: number;
}

export interface GraphLink {
  /** Логін автора PR (source = хто подав PR) */
  source: string;
  /** Логін рев'юера (target = хто зробив review) */
  target: string;
  /** Вага ребра: w = 1.0*N_PR + 0.1*N_comments */
  value: number;
}

export interface SocialGraph {
  nodes: GraphNode[];
  links: GraphLink[];
  /** Bus Factor проекту (мін. кількість девів, що покривають 80% ревю) */
  busFactor: number;
  /** Логін розробника з найвищим BottleneckScore */
  topBottleneck: string | null;
}

// ─── Метрики процесу ─────────────────────────────────────────────────────────

export interface ProcessMetrics {
  totalCommits: number;
  totalPullRequests: number;

  // Code Churn (additions + deletions)
  totalLinesChanged: number;
  avgChurnPerCommit: number;

  // Lead Time (від відкриття PR до мержу)
  avgLeadTimeMins: number;
  avgLeadTimeDays: number;

  // Декомпозиція Lead Time (в годинах)
  avgTimeToStartHours: number;
  avgCodingTimeHours: number;
  avgPickupTimeHours: number;
  avgReviewTimeHours: number;
}

// ─── ML Прогноз Lead Time ────────────────────────────────────────────────────

export interface OpenPRPrediction {
  prNumber: number;
  title: string;
  /** Прогнозований Lead Time у годинах (OLS лінійна регресія) */
  predictedLeadTimeHours: number;
  /** Прогноз у зручному форматі (наприклад "2д 4г") */
  predictedLeadTimeFormatted: string;
}

export interface MLLeadTimePrediction {
  model: 'OLS_LinearRegression' | 'Ridge_LinearRegression';
  /** R² (coefficient of determination) — якість підгонки моделі, від 0 до 1 */
  rSquared: number;
  /** Навчальна вибірка: merged PR з відомим lead time */
  trainingDataSize: number;
  /** β-коефіцієнти: [β0 (intercept), β1...β5] */
  coefficients: number[];
  /** Назви фіч для відображення */
  featureNames: string[];
  /** Прогнози для відкритих PR */
  openPRPredictions: OpenPRPrediction[];
  recommendations: string[];
}
