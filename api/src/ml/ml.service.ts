import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MLLeadTimePrediction, OpenPRPrediction } from '../metrics/types/metrics.types';
import { fitRidge, predictOLS, calculateRSquared } from '../metrics/formulas.util';

const RIDGE_LAMBDA = 0.1;

const MIN_TRAINING_SIZE = 5;

@Injectable()
export class MlService {
  private readonly logger = new Logger(MlService.name);

  constructor(private readonly prisma: PrismaService) { }

  async predictLeadTime(owner: string, repo: string): Promise<MLLeadTimePrediction> {
    this.logger.log(`Running Ridge Regression Lead Time Prediction for ${owner}/${repo}`);

    const repository = await this.prisma.repository.findUnique({
      where: { fullName: `${owner}/${repo}` },
    });

    if (!repository) {
      return this.emptyPrediction('Repository not found in database. Run sync first.');
    }

    const mergedPRs = await this.prisma.pullRequest.findMany({
      where: {
        repositoryId: repository.id,
        state: 'merged',
        leadTimeMins: { not: null },
        mergedAt: { not: null },
      },
      include: {
        reviews: { select: { id: true, body: true } },
        author: { select: { login: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    if (mergedPRs.length < MIN_TRAINING_SIZE) {
      const msg =
        `Insufficient historical data (${mergedPRs.length} merged PRs found, need at least ${MIN_TRAINING_SIZE}). ` +
        `Predictions may be inaccurate. Run sync with more PRs to improve the model.`;
      this.logger.warn(msg);
      return this.emptyPrediction(msg);
    }

    const X_raw: number[][] = [];
    const y: number[] = [];

    const authorLeadTimes = new Map<string, number[]>();
    const seenAuthors = new Set<string>();
    let globalSum = 0;
    let globalCount = 0;

    for (const pr of mergedPRs) {
      const login = pr.author.login;
      const leadTimeHours = pr.leadTimeMins! / 60;

      let authorHistorical = 0;
      if (authorLeadTimes.has(login)) {
        const times = authorLeadTimes.get(login)!;
        authorHistorical = times.reduce((s, v) => s + v, 0) / times.length / 24;
      } else if (globalCount > 0) {
        authorHistorical = (globalSum / globalCount) / 24;
      }

      const reviewCount = pr.reviews.length;
      const reviewDepth = pr.reviews.reduce((sum, r) => sum + (r.body?.length ?? 0), 0) / 1000;

      const createdDay = new Date(pr.createdAt).getUTCDay();
      const isWeekend = createdDay === 0 || createdDay === 6 ? 1 : 0;

      const isNewAuthor = seenAuthors.has(login) ? 0 : 1;

      X_raw.push([1, reviewCount, reviewDepth, authorHistorical, isWeekend, isNewAuthor]);
      y.push(leadTimeHours);

      if (!authorLeadTimes.has(login)) authorLeadTimes.set(login, []);
      authorLeadTimes.get(login)!.push(pr.leadTimeMins!);
      seenAuthors.add(login);
      globalSum += pr.leadTimeMins!;
      globalCount++;
    }

    const numFeatures = X_raw[0].length;
    const mins = new Array(numFeatures).fill(Infinity);
    const maxs = new Array(numFeatures).fill(-Infinity);

    for (const row of X_raw) {
      for (let j = 1; j < numFeatures; j++) {
        if (row[j] < mins[j]) mins[j] = row[j];
        if (row[j] > maxs[j]) maxs[j] = row[j];
      }
    }

    const X_scaled = X_raw.map((row) => {
      const scaledRow = [1];
      for (let j = 1; j < numFeatures; j++) {
        const range = maxs[j] - mins[j];
        if (range === 0) {
          scaledRow.push(0);
        } else {
          scaledRow.push((row[j] - mins[j]) / range);
        }
      }
      return scaledRow;
    });

    let beta: number[];
    let rSquared = 0;

    if (mergedPRs.length < 40) {
      beta = fitRidge(X_scaled, y, RIDGE_LAMBDA);
      const yPred = predictOLS(X_scaled, beta);
      const rawR2 = calculateRSquared(y, yPred);

      const n = y.length;
      const k = 5;
      if (n > k + 1) {
        rSquared = 1 - ((1 - rawR2) * (n - 1)) / (n - k - 1);
      } else {
        rSquared = rawR2;
      }
      this.logger.log(`Trained on 100% (n=${n}). Adjusted R²=${rSquared}`);
    } else {
      const splitIdx = Math.floor(mergedPRs.length * 0.8);
      const X_train = X_scaled.slice(0, splitIdx);
      const y_train = y.slice(0, splitIdx);
      const X_test = X_scaled.slice(splitIdx);
      const y_test = y.slice(splitIdx);

      beta = fitRidge(X_train, y_train, RIDGE_LAMBDA);
      const yPredTest = predictOLS(X_test, beta);
      rSquared = calculateRSquared(y_test, yPredTest);
      this.logger.log(`Trained on 80% (n=${splitIdx}), Tested on 20% (n=${X_test.length}). Test R²=${rSquared}`);
    }

    let rSquaredClipped = rSquared;
    const recommendations: string[] = [];

    if (rSquared < 0) {
      this.logger.warn(`Model produced negative R² (${rSquared.toFixed(3)}). Data variance is too high. Clipping to 0.01`);
      rSquaredClipped = 0.01;
      recommendations.push("Data is too noisy or non-linear for accurate linear prediction.");
    } else {
      rSquaredClipped = Math.min(1, rSquared);
    }

    this.logger.log(`Ridge model β=[${beta.map((b) => b.toFixed(3)).join(', ')}]`);

    const openPRs = await this.prisma.pullRequest.findMany({
      where: {
        repositoryId: repository.id,
        state: 'open',
      },
      include: {
        reviews: { select: { id: true, body: true } },
        author: { select: { login: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const openPRPredictions: OpenPRPrediction[] = [];

    for (const pr of openPRs) {
      const login = pr.author.login;
      const reviewCount = pr.reviews.length;
      const reviewDepth =
        pr.reviews.reduce((sum, r) => sum + (r.body?.length ?? 0), 0) / 1000;

      let authorHistorical = 0;
      if (authorLeadTimes.has(login)) {
        const times = authorLeadTimes.get(login)!;
        authorHistorical = times.reduce((s, v) => s + v, 0) / times.length / 24;
      } else if (globalCount > 0) {
        authorHistorical = (globalSum / globalCount) / 24;
      }

      const createdDay = new Date(pr.createdAt).getUTCDay();
      const isWeekend = createdDay === 0 || createdDay === 6 ? 1 : 0;
      const isNewAuthor = seenAuthors.has(pr.author.login) ? 0 : 1;

      const rawFeatures = [1, reviewCount, reviewDepth, authorHistorical, isWeekend, isNewAuthor];

      const scaledFeatures = [1];
      for (let j = 1; j < numFeatures; j++) {
        const range = maxs[j] - mins[j];
        if (range === 0) {
          scaledFeatures.push(0);
        } else {
          scaledFeatures.push((rawFeatures[j] - mins[j]) / range);
        }
      }

      const rawPrediction = predictOLS([scaledFeatures], beta)[0];
      const predictedHours = Math.max(0, Number(rawPrediction.toFixed(1)));

      openPRPredictions.push({
        prNumber: pr.number,
        title: pr.title,
        predictedLeadTimeHours: predictedHours,
        predictedLeadTimeFormatted: this.formatHours(predictedHours),
      });
    }

    if (rSquaredClipped < 0.2 && rSquared > 0) {
      recommendations.push(
        `Low model fit (R²=${rSquaredClipped.toFixed(2)}): Lead Time varies unpredictably. ` +
        `Consider standardizing PR size and review processes across the team.`,
      );
    } else if (rSquaredClipped >= 0.5) {
      recommendations.push(
        `Good model fit: R²=${rSquaredClipped.toFixed(2)} — the model explains ${(rSquaredClipped * 100).toFixed(0)}% ` +
        `of Lead Time variation. Key drivers: review activity and author history.`,
      );
    }

    if (beta[1] > 2) {
      recommendations.push(
        `High review count coefficient (β=${beta[1].toFixed(2)}): ` +
        `PRs with many reviews tend to take significantly longer. Consider smaller, more focused PRs.`,
      );
    }

    if (beta[4] > 3) {
      recommendations.push(
        `Weekend PRs have substantially longer Lead Time (β=${beta[4].toFixed(2)}h). ` +
        `Plan code reviews on weekdays to improve cycle time.`,
      );
    }

    if (openPRPredictions.some((p) => p.predictedLeadTimeHours > 72)) {
      recommendations.push(
        `Some open PRs are predicted to take over 72h. ` +
        `Review their complexity or reassign reviewers to unblock the pipeline.`,
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        `Pull Request process looks healthy. Lead Time is predictable and within normal range.`,
      );
    }

    return {
      model: 'Ridge_LinearRegression',
      rSquared: rSquaredClipped,
      trainingDataSize: mergedPRs.length,
      coefficients: beta.map((b) => Number(b.toFixed(4))),
      featureNames: [
        'intercept',
        'reviewCount',
        'reviewDepth/1k',
        'authorHistoricalAvg/24h',
        'isWeekend',
        'isNewAuthor',
      ],
      openPRPredictions,
      recommendations,
    };
  }

  private formatHours(hours: number): string {
    if (hours < 1) return `${Math.round(hours * 60)}min`;
    if (hours < 24) return `${Math.round(hours)}h`;
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }

  private emptyPrediction(reason: string): MLLeadTimePrediction {
    this.logger.warn(`Prediction skipped: ${reason}`);
    return {
      model: 'Ridge_LinearRegression',
      rSquared: 0,
      trainingDataSize: 0,
      coefficients: [],
      featureNames: [
        'intercept',
        'reviewCount',
        'reviewDepth/1k',
        'authorHistoricalAvg/24h',
        'isWeekend',
        'isNewAuthor',
      ],
      openPRPredictions: [],
      recommendations: [reason],
    };
  }
}
