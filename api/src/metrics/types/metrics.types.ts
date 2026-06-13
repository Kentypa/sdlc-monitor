export type BurnoutRiskLevel = 'SAFE' | 'WARNING' | 'CRITICAL';

export interface DeveloperBurnout {
  developerId: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;

  totalCommits: number;
  overtimeCommits: number;

  fOvertime: number;
  fContext: number;
  fChurn: number;
  fBottleneck: number;

  activeBranches: number;
  avgLinesPerCommit: number;
  outDegree: number;
  bottleneckScore: number;

  burnoutIndex: number;
  burnoutIndexExtended: number;
  riskLevel: BurnoutRiskLevel;
}

export interface GraphNode {
  id: string;
  name: string;
  group: number;
  val: number;
  burnout: number;
  outDegree: number;
  bottleneckScore: number;
}

export interface GraphLink {
  source: string;
  target: string;
  value: number;
}

export interface SocialGraph {
  nodes: GraphNode[];
  links: GraphLink[];
  busFactor: number;
  topBottleneck: string | null;
}

export interface ProcessMetrics {
  totalCommits: number;
  totalPullRequests: number;

  totalLinesChanged: number;
  avgChurnPerCommit: number;

  avgLeadTimeMins: number;
  avgLeadTimeDays: number;

  avgTimeToStartHours: number;
  avgCodingTimeHours: number;
  avgPickupTimeHours: number;
  avgReviewTimeHours: number;
}

export interface OpenPRPrediction {
  prNumber: number;
  title: string;
  predictedLeadTimeHours: number;
  predictedLeadTimeFormatted: string;
}

export interface MLLeadTimePrediction {
  model: 'OLS_LinearRegression' | 'Ridge_LinearRegression';
  rSquared: number;
  trainingDataSize: number;
  coefficients: number[];
  featureNames: string[];
  openPRPredictions: OpenPRPrediction[];
  recommendations: string[];
}
