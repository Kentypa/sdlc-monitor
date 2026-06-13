import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
  Activity,
  ShieldAlert,
  GitBranch,
  ShieldCheck,
  Users,
  Flame,
  Bus,
  TrendingUp,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import SocialGraph from '../components/SocialGraph';
import BurnoutChart from '../components/BurnoutChart';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface ProcessMetrics {
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

interface OpenPRPrediction {
  prNumber: number;
  title: string;
  predictedLeadTimeHours: number;
  predictedLeadTimeFormatted: string;
}

interface MLPrediction {
  model: string;
  rSquared: number;
  trainingDataSize: number;
  coefficients: number[];
  featureNames: string[];
  openPRPredictions: OpenPRPrediction[];
  recommendations: string[];
}

interface DeveloperBurnout {
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
  riskLevel: 'SAFE' | 'WARNING' | 'CRITICAL';
}

interface GraphData {
  nodes: any[];
  links: any[];
  busFactor: number;
  topBottleneck: string | null;
}

const API_BASE = 'http://localhost:3000/api';

const riskColorMap = {
  SAFE: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  WARNING: 'text-amber-600 bg-amber-50 border-amber-200',
  CRITICAL: 'text-red-600 bg-red-50 border-red-200',
};

const riskBadgeMap = {
  SAFE: 'text-emerald-600 bg-emerald-50 border border-emerald-200',
  WARNING: 'text-amber-600 bg-amber-50 border border-amber-200',
  CRITICAL: 'text-red-600 bg-red-50 border border-red-200',
};

export default function Dashboard() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();

  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('Initializing...');
  const [error, setError] = useState<string | null>(null);

  const [processData, setProcessData] = useState<ProcessMetrics | null>(null);
  const [mlData, setMlData] = useState<MLPrediction | null>(null);
  const [burnoutData, setBurnoutData] = useState<DeveloperBurnout[]>([]);
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [],
    links: [],
    busFactor: 0,
    topBottleneck: null,
  });

  const [baseWeights, setBaseWeights] = useState({ w1: 0.4, w2: 0.3, w3: 0.3 });
  const [extWeights, setExtWeights] = useState({ w1: 0.35, w2: 0.25, w3: 0.2, w4: 0.2 });

  const calculatedBurnoutData = useMemo(() => {
    return burnoutData.map((dev) => {
      const bi =
        baseWeights.w1 * dev.fOvertime +
        baseWeights.w2 * dev.fContext +
        baseWeights.w3 * dev.fChurn;
      const biExt =
        extWeights.w1 * dev.fOvertime +
        extWeights.w2 * dev.fContext +
        extWeights.w3 * dev.fChurn +
        extWeights.w4 * dev.fBottleneck;

      let riskLevel: 'SAFE' | 'WARNING' | 'CRITICAL' = 'SAFE';
      if (bi >= 0.6) riskLevel = 'CRITICAL';
      else if (bi >= 0.3) riskLevel = 'WARNING';

      return {
        ...dev,
        burnoutIndex: bi,
        burnoutIndexExtended: biExt,
        riskLevel,
      };
    });
  }, [burnoutData, baseWeights, extWeights]);

  const sumBase = Number((baseWeights.w1 + baseWeights.w2 + baseWeights.w3).toFixed(2));
  const sumExt = Number((extWeights.w1 + extWeights.w2 + extWeights.w3 + extWeights.w4).toFixed(2));


  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      if (!owner || !repo) return;
      setLoading(true);
      setError(null);

      try {
        setLoadingText('Syncing with GitHub (up to 100 commits)...');
        await axios.post(`${API_BASE}/repositories/sync`, {
          owner,
          repo,
          commitLimit: 100,
        });

        if (!isMounted) return;

        setLoadingText('Computing metrics...');
        const [procRes, mlRes, burnRes, graphRes] = await Promise.all([
          axios.get(`${API_BASE}/metrics/${owner}/${repo}/process`),
          axios.get(`${API_BASE}/ml/${owner}/${repo}/predict`),
          axios.get(`${API_BASE}/metrics/${owner}/${repo}/burnout`),
          axios.get(`${API_BASE}/metrics/${owner}/${repo}/graph`),
        ]);

        if (isMounted) {
          setProcessData(procRes.data);
          setMlData(mlRes.data);
          setBurnoutData(burnRes.data);
          setGraphData(graphRes.data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(
            'Failed to load data: ' +
            (err.response?.data?.message || err.message),
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [owner, repo]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="h-12 w-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-[var(--text-muted)] animate-pulse">{loadingText}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-md p-8 text-center max-w-2xl mx-auto mt-12 border-red-500/30">
        <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-red-500 mb-2">Analysis Failed</h2>
        <p className="text-[var(--text-muted)] mb-6">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded hover:bg-[var(--bg-base)] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const criticalDevs = calculatedBurnoutData.filter((d) => d.riskLevel === 'CRITICAL').length;
  const warningDevs = calculatedBurnoutData.filter((d) => d.riskLevel === 'WARNING').length;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[var(--border-color)] pb-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-main)] m-0">SDLC Dashboard</h1>
          <p className="text-[var(--text-muted)] mt-1 flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            {owner}/{repo}
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          {criticalDevs > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-md border border-red-200 bg-red-50 text-red-700 shadow-sm">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <div className="text-xs font-bold uppercase tracking-wide opacity-80">Critical Risk</div>
                <div className="text-xl font-black leading-none">{criticalDevs} devs</div>
              </div>
            </div>
          )}
          {warningDevs > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-md border border-amber-200 bg-amber-50 text-amber-700 shadow-sm">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <div className="text-xs font-bold uppercase tracking-wide opacity-80">Warning</div>
                <div className="text-xl font-black leading-none">{warningDevs} devs</div>
              </div>
            </div>
          )}
          {criticalDevs === 0 && warningDevs === 0 && burnoutData.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm">
              <ShieldCheck className="h-6 w-6" />
              <div>
                <div className="text-xs font-bold uppercase tracking-wide opacity-80">Team Status</div>
                <div className="text-xl font-black leading-none">ALL SAFE</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {processData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-md p-5">
            <div className="text-[var(--text-muted)] text-sm mb-1">Total Commits</div>
            <div className="text-3xl font-bold text-[var(--text-main)]">{processData.totalCommits}</div>
          </div>
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-md p-5">
            <div className="text-[var(--text-muted)] text-sm mb-1">Pull Requests</div>
            <div className="text-3xl font-bold text-[var(--text-main)]">{processData.totalPullRequests}</div>
          </div>
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-md p-5">
            <div className="text-[var(--text-muted)] text-sm mb-1">Avg Lead Time</div>
            <div className="text-3xl font-bold text-[var(--text-main)]">
              {processData.avgLeadTimeDays}{' '}
              <span className="text-sm font-normal text-[var(--text-muted)]">days</span>
            </div>

            <div className="mt-4 space-y-1.5 border-t border-[var(--border-color)]/50 pt-3">
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-muted)]">Time to Start</span>
                <span className="font-mono text-[var(--text-main)]">{processData.avgTimeToStartHours}h</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-muted)]">Coding Time</span>
                <span className="font-mono text-[var(--text-main)]">{processData.avgCodingTimeHours}h</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-muted)]" title="Wait time before first review">Pickup Time</span>
                <span className={cn(
                  "font-mono font-bold",
                  processData.avgPickupTimeHours > 24 ? "text-red-400" : processData.avgPickupTimeHours > 8 ? "text-amber-400" : "text-[var(--text-main)]"
                )}>
                  {processData.avgPickupTimeHours}h
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-muted)]">Review Time</span>
                <span className="font-mono text-[var(--text-main)]">{processData.avgReviewTimeHours}h</span>
              </div>
            </div>
          </div>
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-md p-5">
            <div className="text-[var(--text-muted)] text-sm mb-1">Avg Code Churn</div>
            <div className="text-3xl font-bold text-[var(--text-main)]">
              {processData.avgChurnPerCommit}{' '}
              <span className="text-sm font-normal text-[var(--text-muted)]">lines/commit</span>
            </div>
          </div>
        </div>
      )}

      {mlData && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-md overflow-hidden">
          <div className="p-6 border-b border-[var(--border-color)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-500" />
              <div>
                <h2 className="text-xl font-bold text-[var(--text-main)] m-0">
                  ML Lead Time Prediction
                </h2>
                <p className="text-[var(--text-muted)] text-sm mt-0.5">
                  Ridge Linear Regression · trained on {mlData.trainingDataSize} merged PRs
                </p>
              </div>
            </div>

            <div className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md border shadow-sm',
              mlData.rSquared >= 0.5
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : mlData.rSquared >= 0.2
                  ? 'text-amber-700 bg-amber-50 border-amber-200'
                  : 'text-[var(--text-muted)] bg-[var(--bg-base)] border-[var(--border-color)]',
            )}>
              <div>
                <div className="text-xs font-bold uppercase tracking-wide opacity-80">R² Score</div>
                <div className="text-2xl font-black leading-none">{mlData.rSquared.toFixed(3)}</div>
              </div>
            </div>
          </div>

          <div className="p-6 grid md:grid-cols-2 gap-6">
            {mlData.recommendations.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-indigo-400 mb-3 flex items-center gap-1.5">
                  <Activity className="h-4 w-4" /> Insights & Recommendations
                </h3>
                <ul className="space-y-2">
                  {mlData.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-main)]">
                      <span className="text-indigo-500 font-bold mt-0.5">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {mlData.openPRPredictions.length > 0 ? (
              <div>
                <h3 className="text-sm font-bold text-indigo-400 mb-3 flex items-center gap-1.5">
                  <Clock className="h-4 w-4" /> Lead Time Forecast (Open PRs)
                </h3>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {mlData.openPRPredictions.map((p) => (
                    <div
                      key={p.prNumber}
                      className="flex items-center justify-between text-sm border border-[var(--border-color)] rounded-lg px-3 py-2 bg-[var(--bg-base)]/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[var(--text-muted)] font-mono text-xs shrink-0">
                          #{p.prNumber}
                        </span>
                        <span
                          className="text-[var(--text-main)] truncate"
                          title={p.title}
                        >
                          {p.title.length > 40 ? p.title.slice(0, 40) + '…' : p.title}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'font-bold font-mono shrink-0 ml-3',
                          p.predictedLeadTimeHours > 72
                            ? 'text-red-400'
                            : p.predictedLeadTimeHours > 24
                              ? 'text-amber-400'
                              : 'text-emerald-400',
                        )}
                      >
                        ~{p.predictedLeadTimeFormatted}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center text-[var(--text-muted)] text-sm h-24">
                No open PRs to forecast
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-md overflow-hidden">
        <div className="p-6 border-b border-[var(--border-color)] flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[var(--text-muted)]" />
            <div>
              <h2 className="text-xl font-bold text-[var(--text-main)] m-0">
                Social Graph (Code Review)
              </h2>
              <p className="text-[var(--text-muted)] text-sm mt-1">
                Directed graph: PR Author → Reviewer. Node size corresponds to OutDegree (Review Volume).
              </p>
            </div>
          </div>

          {graphData.busFactor > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-md border text-[var(--accent)] bg-blue-50 border-blue-200 shadow-sm shrink-0">
              <Bus className="h-5 w-5" />
              <div>
                <div className="text-xs font-bold uppercase tracking-wide opacity-80">Bus Factor</div>
                <div className="text-2xl font-black leading-none">
                  {graphData.busFactor}
                  <span className="text-xs font-normal ml-1 opacity-70">
                    {graphData.busFactor === 1 ? 'dev' : 'devs'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {graphData.busFactor > 0 && (
          <div className={cn(
            'px-6 py-3 text-sm border-b border-[var(--border-color)]',
            graphData.busFactor <= 2
              ? 'bg-red-500/5 text-red-400'
              : graphData.busFactor <= 4
                ? 'bg-amber-500/5 text-amber-400'
                : 'bg-emerald-500/5 text-emerald-400',
          )}>
            <span className="font-bold">
              Project Bus Factor: {graphData.busFactor}{' '}
              {graphData.busFactor === 1 ? 'developer' : 'developers'}.
            </span>
            {' '}
            {graphData.busFactor <= 2
              ? 'Critical dependency! Losing them halts 80% of code reviews.'
              : graphData.busFactor <= 4
                ? 'Moderate risk — code review is distributed among a few key people.'
                : 'Healthy — code review activity is well distributed across the team.'}
            {graphData.topBottleneck && (
              <span className="ml-2 opacity-80">
                Highest Bottleneck Score: <strong>{graphData.topBottleneck}</strong>.
              </span>
            )}
          </div>
        )}

        <div className="p-4 bg-[var(--bg-base)]/50">
          <SocialGraph
            nodes={graphData.nodes}
            links={graphData.links}
            busFactor={graphData.busFactor}
            topBottleneck={graphData.topBottleneck}
          />
        </div>
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-md overflow-hidden">
        <div className="p-6 border-b border-[var(--border-color)]">
          <h2 className="text-xl font-bold text-[var(--text-main)] m-0">
            Interactive Burnout Index Weights
          </h2>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            Adjust the weights to adapt the formula to your team's needs. The sum should equal 1.0.
          </p>
        </div>
        <div className="p-6 grid md:grid-cols-2 gap-8">
          <div className="bg-[var(--bg-base)] p-4 rounded-xl border border-[var(--border-color)]/50">
            <h3 className="text-sm font-bold text-indigo-400 mb-4">Base Formula Weights (BI)</h3>
            <div className="space-y-4">
              {(['w1', 'w2', 'w3'] as const).map((key) => {
                const labels = { w1: 'Out-of-Hours', w2: 'Context Switch', w3: 'Code Instability' };
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-[var(--text-muted)]">{labels[key]} ({key})</span>
                      <span className="font-mono font-bold text-[var(--text-main)]">
                        {baseWeights[key].toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0" max="1" step="0.05"
                      value={baseWeights[key]}
                      onChange={(e) => setBaseWeights({ ...baseWeights, [key]: parseFloat(e.target.value) })}
                      className="w-full h-1.5 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                );
              })}
              {sumBase !== 1.0 && (
                <div className="text-amber-500 text-xs mt-3 flex items-center gap-1.5 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                  <AlertTriangle className="h-3 w-3" />
                  Sum is {sumBase.toFixed(2)}. It is recommended to equal exactly 1.0.
                </div>
              )}
            </div>
          </div>

          <div className="bg-[var(--bg-base)] p-4 rounded-xl border border-[var(--border-color)]/50">
            <h3 className="text-sm font-bold text-indigo-400 mb-4">Extended Formula Weights (BI ext)</h3>
            <div className="space-y-4">
              {(['w1', 'w2', 'w3', 'w4'] as const).map((key) => {
                const labels = { w1: 'Out-of-Hours', w2: 'Context Switch', w3: 'Code Instability', w4: 'Review Bottleneck' };
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-[var(--text-muted)]">{labels[key]} ({key})</span>
                      <span className="font-mono font-bold text-[var(--text-main)]">
                        {extWeights[key].toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0" max="1" step="0.05"
                      value={extWeights[key]}
                      onChange={(e) => setExtWeights({ ...extWeights, [key]: parseFloat(e.target.value) })}
                      className="w-full h-1.5 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                );
              })}
              {sumExt !== 1.0 && (
                <div className="text-amber-500 text-xs mt-3 flex items-center gap-1.5 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                  <AlertTriangle className="h-3 w-3" />
                  Sum is {sumExt.toFixed(2)}. It is recommended to equal exactly 1.0.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-md overflow-hidden">
        <div className="p-6 border-b border-[var(--border-color)] flex items-center gap-2">
          <Flame className="h-5 w-5 text-[var(--text-muted)]" />
          <div>
            <h2 className="text-xl font-bold text-[var(--text-main)] m-0">
              Multifactor Burnout Assessment
            </h2>
            <p className="text-[var(--text-muted)] text-sm mt-1">
              BI = {baseWeights.w1.toFixed(2)} · Out-of-Hours Work + {baseWeights.w2.toFixed(2)} · Context Switching + {baseWeights.w3.toFixed(2)} · Code Instability
            </p>
          </div>
        </div>
        <div className="p-4 bg-[var(--bg-base)]/50">
          <BurnoutChart data={calculatedBurnoutData} />
        </div>
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-md overflow-hidden">
        <div className="p-6 border-b border-[var(--border-color)]">
          <h2 className="text-xl font-bold text-[var(--text-main)] m-0">
            Developer Burnout — Detailed Breakdown
          </h2>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            Per-developer factor analysis used in the Burnout Index formula.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--bg-base)]">
                <th className="p-3 text-[var(--text-muted)] font-medium border-b border-[var(--border-color)]">
                  Developer
                </th>
                <th className="p-3 text-[var(--text-muted)] font-medium border-b border-[var(--border-color)] text-right">
                  Commits
                </th>
                <th className="p-3 text-[var(--text-muted)] font-medium border-b border-[var(--border-color)] text-right" title="Ratio of commits made outside working hours (weekends / 22:00–06:00)">
                  Out-of-Hours Work
                </th>
                <th className="p-3 text-[var(--text-muted)] font-medium border-b border-[var(--border-color)] text-right" title="Context switching: min(1, (N_branches-1)/3)">
                  Context Switching
                </th>
                <th className="p-3 text-[var(--text-muted)] font-medium border-b border-[var(--border-color)] text-right" title="Code Instability: min(1, avgLinesPerCommit/500)">
                  Code Instability
                </th>
                <th className="p-3 text-[var(--text-muted)] font-medium border-b border-[var(--border-color)] text-right" title="Base Burnout Risk = 0.4·f_overtime + 0.3·f_context + 0.3·f_churn">
                  Base Burnout Risk
                </th>
                <th className="p-3 text-[var(--text-muted)] font-medium border-b border-[var(--border-color)] text-right" title="Extended Risk includes Review Bottleneck score">
                  Extended Risk
                </th>
                <th className="p-3 text-[var(--text-muted)] font-medium border-b border-[var(--border-color)] text-right">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {calculatedBurnoutData.map((dev) => (
                <tr
                  key={dev.developerId}
                  className="border-b border-[var(--border-color)]/50 hover:bg-[var(--bg-base)]/50 transition-colors"
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {dev.avatarUrl ? (
                        <img
                          src={dev.avatarUrl}
                          alt={dev.login}
                          className="w-7 h-7 rounded-full"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs">
                          {dev.login.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-[var(--text-main)]">{dev.login}</div>
                        {dev.outDegree > 0 && (
                          <div className="text-xs text-[var(--text-muted)]">
                            Review Volume: {dev.outDegree.toFixed(1)}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-right font-mono text-[var(--text-main)]">
                    {dev.totalCommits}
                  </td>
                  <td className="p-3 text-right font-mono text-[var(--text-muted)]">
                    {(dev.fOvertime * 100).toFixed(0)}%
                  </td>
                  <td className="p-3 text-right font-mono text-[var(--text-muted)]">
                    {dev.fContext.toFixed(2)}
                  </td>
                  <td className="p-3 text-right font-mono text-[var(--text-muted)]">
                    {dev.fChurn.toFixed(2)}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-[var(--text-main)]">
                    {dev.burnoutIndex.toFixed(3)}
                  </td>
                  <td className="p-3 text-right font-mono text-[var(--text-muted)]">
                    {dev.burnoutIndexExtended.toFixed(3)}
                  </td>
                  <td className="p-3 text-right">
                    <span className={cn('inline-flex px-2 py-0.5 rounded-md text-xs font-bold', riskBadgeMap[dev.riskLevel])}>
                      {dev.riskLevel}
                    </span>
                  </td>
                </tr>
              ))}
              {calculatedBurnoutData.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-[var(--text-muted)]">
                    No developer data available. Sync the repository first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
