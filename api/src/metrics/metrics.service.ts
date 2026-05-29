import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DeveloperBurnout,
  SocialGraph,
  ProcessMetrics,
  GraphNode,
  GraphLink,
} from './types/metrics.types';
import {
  calcFOvertime,
  calcFContext,
  calcFChurn,
  calculateBurnoutIndex,
  calculateBurnoutIndexExtended,
  getBurnoutRiskLevel,
  calculateEdgeWeight,
  calculateOutDegree,
  calculateBottleneckScore,
  normalizeBottleneckScore,
  calculateBusFactor,
  GraphEdge,
} from './formulas.util';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── 1. BURNOUT INDEX ────────────────────────────────────────────────────────
  // Формула: BI = 0.4 * f_overtime + 0.3 * f_context + 0.3 * f_churn
  // Рівні: BI < 0.3 → SAFE | 0.3–0.6 → WARNING | ≥ 0.6 → CRITICAL

  async calculateBurnout(owner: string, repo: string): Promise<DeveloperBurnout[]> {
    this.logger.log(`Calculating Burnout Index for ${owner}/${repo}`);

    const repository = await this.prisma.repository.findUnique({
      where: { fullName: `${owner}/${repo}` },
    });
    if (!repository) throw new NotFoundException('Repository not found');

    // ── Дані комітів розробників ──────────────────────────────────────────────
    const developers = await this.prisma.developer.findMany({
      where: {
        commits: { some: { repositoryId: repository.id } },
      },
      include: {
        commits: {
          where: { repositoryId: repository.id },
          select: {
            id: true,
            isOvertime: true,
            additions: true,
            deletions: true,
          },
        },
        // PR автора для апроксимації N_branches (унікальні гілки за 7 днів)
        pullRequests: {
          where: {
            repositoryId: repository.id,
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
          select: { id: true, headBranch: true },
        },
      },
    });

    const results: DeveloperBurnout[] = [];

    for (const dev of developers) {
      // Виключаємо ботів
      const loginLower = dev.login.toLowerCase();
      if (
        loginLower.endsWith('[bot]') ||
        loginLower.includes('dependabot') ||
        loginLower.includes('renovate')
      ) {
        continue;
      }

      const totalCommits = dev.commits.length;
      // Статистична значимість: мінімум 3 коміти
      if (totalCommits < 3) continue;

      // ── f_overtime ────────────────────────────────────────────────────────
      const overtimeCommits = dev.commits.filter((c) => c.isOvertime).length;
      const fOvertime = calcFOvertime(overtimeCommits, totalCommits);

      // ── f_context ─────────────────────────────────────────────────────────
      // N_branches = кількість унікальних гілок у PR за останні 7 днів
      const uniqueBranches = new Set(dev.pullRequests.map((pr) => pr.headBranch)).size;
      const nBranches = Math.max(uniqueBranches, 1); // мінімум 1
      const fContext = calcFContext(nBranches);

      // ── f_churn ───────────────────────────────────────────────────────────
      const totalLines = dev.commits.reduce(
        (sum, c) => sum + c.additions + c.deletions,
        0,
      );
      const avgLinesPerCommit = totalCommits > 0 ? totalLines / totalCommits : 0;
      const fChurn = calcFChurn(avgLinesPerCommit);

      // ── Базовий BI ────────────────────────────────────────────────────────
      const burnoutIndex = calculateBurnoutIndex(fOvertime, fContext, fChurn);
      const riskLevel = getBurnoutRiskLevel(burnoutIndex);

      // f_bottleneck і burnoutIndexExtended заповнюються після buildSocialGraph
      // Тут ставимо 0 як placeholder (перезаписується в calculateSocialGraph)
      const burnoutIndexExtended = calculateBurnoutIndexExtended(
        fOvertime, fContext, fChurn, 0,
      );

      // Оновлюємо в БД
      await this.prisma.developer.update({
        where: { id: dev.id },
        data: {
          burnoutIndex,
          overtimeRatio: fOvertime,
        },
      });

      results.push({
        developerId: dev.id,
        login: dev.login,
        name: dev.name,
        avatarUrl: dev.avatarUrl,
        totalCommits,
        overtimeCommits,
        fOvertime,
        fContext,
        fChurn,
        fBottleneck: 0,   // заповниться в calculateSocialGraph
        activeBranches: nBranches,
        avgLinesPerCommit: Math.round(avgLinesPerCommit),
        outDegree: 0,     // заповниться в calculateSocialGraph
        bottleneckScore: 0,
        burnoutIndex,
        burnoutIndexExtended,
        riskLevel,
      });
    }

    return results.sort((a, b) => b.burnoutIndex - a.burnoutIndex);
  }

  // ─── 2. SOCIAL GRAPH (Code Review) ──────────────────────────────────────────
  // Напрям ребра: Автор PR → Рев'юер (хто кому давав ревю)
  // Вага: w = 1.0 * N_PR + 0.1 * N_comments

  async calculateSocialGraph(owner: string, repo: string): Promise<SocialGraph> {
    this.logger.log(`Calculating Social Graph for ${owner}/${repo}`);

    const repository = await this.prisma.repository.findUnique({
      where: { fullName: `${owner}/${repo}` },
    });
    if (!repository) throw new NotFoundException('Repository not found');

    // ── Ревю з інформацією про автора PR та рев'юера ─────────────────────────
    const reviews = await this.prisma.review.findMany({
      where: { pullRequest: { repositoryId: repository.id } },
      include: {
        reviewer: { select: { login: true, name: true } },
        pullRequest: {
          include: { author: { select: { login: true } } },
        },
      },
    });

    // ── Дані розробників для вузлів ──────────────────────────────────────────
    const burnoutResults = await this.calculateBurnout(owner, repo);
    const burnoutMap = new Map(burnoutResults.map((d) => [d.login, d]));

    // ── Побудова ребер графа ──────────────────────────────────────────────────
    // Рахуємо N_PR та N_comments між кожною парою (author → reviewer)
    const edgeDataMap = new Map<
      string,
      { nPR: number; nComments: number; author: string; reviewer: string }
    >();

    for (const review of reviews) {
      const authorLogin = review.pullRequest.author.login;
      const reviewerLogin = review.reviewer.login;

      // Саморевю не враховуємо
      if (authorLogin === reviewerLogin) continue;

      const key = `${authorLogin}→${reviewerLogin}`;
      const existing = edgeDataMap.get(key);
      // N_comments = кількість слів/символів у тілі ревю (апроксимація)
      const commentLen = review.body ? review.body.length : 0;

      if (existing) {
        existing.nPR += 1;
        existing.nComments += commentLen;
      } else {
        edgeDataMap.set(key, {
          nPR: 1,
          nComments: commentLen,
          author: authorLogin,
          reviewer: reviewerLogin,
        });
      }
    }

    // ── Побудова масиву ребер із вагами ─────────────────────────────────────
    const edges: GraphEdge[] = [];
    const graphLinks: GraphLink[] = [];

    for (const [, data] of edgeDataMap) {
      const weight = calculateEdgeWeight(data.nPR, data.nComments);
      edges.push({ source: data.author, target: data.reviewer, weight });
      graphLinks.push({ source: data.author, target: data.reviewer, value: weight });
    }

    // ── Обчислення OutDegree для кожного вузла ───────────────────────────────
    const allLogins = new Set<string>();
    burnoutResults.forEach((d) => allLogins.add(d.login));
    edges.forEach((e) => {
      allLogins.add(e.source);
      allLogins.add(e.target);
    });

    const outDegreeMap = new Map<string, number>();
    const reviewersPerDevMap = new Map<string, Set<string>>();

    for (const login of allLogins) {
      const od = calculateOutDegree(login, edges);
      outDegreeMap.set(login, od);
      // Хто є рев'юерами цього девелопера (target вузли де source=login)
      const reviewers = new Set(
        edges.filter((e) => e.source === login).map((e) => e.target),
      );
      reviewersPerDevMap.set(login, reviewers);
    }

    const nTotalDevs = allLogins.size;

    // ── Обчислення BottleneckScore ────────────────────────────────────────────
    const bottleneckMap = new Map<string, number>();
    for (const login of allLogins) {
      const od = outDegreeMap.get(login) ?? 0;
      const nReviewers = reviewersPerDevMap.get(login)?.size ?? 0;
      const bs = calculateBottleneckScore(od, nReviewers, nTotalDevs);
      bottleneckMap.set(login, bs);
    }

    const maxBottleneck = Math.max(...Array.from(bottleneckMap.values()), 0);
    const topBottleneckEntry = [...bottleneckMap.entries()].sort((a, b) => b[1] - a[1])[0];
    const topBottleneck = topBottleneckEntry?.[0] ?? null;

    // ── Bus Factor ────────────────────────────────────────────────────────────
    const busFactor = calculateBusFactor(outDegreeMap);

    // ── Побудова вузлів із оновленими даними ─────────────────────────────────
    const nodesMap = new Map<string, GraphNode>();

    for (const login of allLogins) {
      const dev = burnoutMap.get(login);
      const od = outDegreeMap.get(login) ?? 0;
      const rawBS = bottleneckMap.get(login) ?? 0;
      const normBS = normalizeBottleneckScore(rawBS, maxBottleneck);
      const bi = dev?.burnoutIndex ?? 0;

      // Якщо є дані burnout — обчислюємо розширений BI з f_bottleneck
      let biExt = bi;
      if (dev) {
        biExt = calculateBurnoutIndexExtended(
          dev.fOvertime,
          dev.fContext,
          dev.fChurn,
          normBS,
        );
      }

      const riskLevel = getBurnoutRiskLevel(biExt);
      const group = riskLevel === 'CRITICAL' ? 3 : riskLevel === 'WARNING' ? 2 : 1;

      // Розмір вузла залежить від OutDegree (активність у ревю)
      const val = Math.max(1, Math.min(od + 1, 30));

      nodesMap.set(login, {
        id: login,
        name: dev?.name || login,
        group,
        val,
        burnout: biExt,
        outDegree: od,
        bottleneckScore: rawBS,
      });

      // Оновлюємо burnout record якщо є
      if (dev) {
        dev.fBottleneck = normBS;
        dev.outDegree = od;
        dev.bottleneckScore = rawBS;
        dev.burnoutIndexExtended = biExt;
        dev.riskLevel = riskLevel;
      }
    }

    this.logger.log(
      `✅ Social Graph: ${nodesMap.size} nodes, ${graphLinks.length} links, busFactor=${busFactor}, topBottleneck=${topBottleneck}`,
    );

    return {
      nodes: Array.from(nodesMap.values()),
      links: graphLinks,
      busFactor,
      topBottleneck,
    };
  }

  // ─── 3. PROCESS METRICS (DORA style) ────────────────────────────────────────

  async calculateProcessMetrics(owner: string, repo: string): Promise<ProcessMetrics> {
    this.logger.log(`Calculating Process Metrics for ${owner}/${repo}`);

    const repository = await this.prisma.repository.findUnique({
      where: { fullName: `${owner}/${repo}` },
      include: {
        commits: { select: { additions: true, deletions: true } },
        pullRequests: {
          select: {
            leadTimeMins: true,
            createdAt: true,
            mergedAt: true,
            reviews: {
              select: { submittedAt: true },
              orderBy: { submittedAt: 'asc' },
            },
          },
        },
      },
    });
    if (!repository) throw new NotFoundException('Repository not found');

    const totalCommits = repository.commits.length;
    const totalLinesChanged = repository.commits.reduce(
      (sum, c) => sum + c.additions + c.deletions,
      0,
    );
    const avgChurnPerCommit =
      totalCommits > 0 ? Math.round(totalLinesChanged / totalCommits) : 0;

    const mergedPRs = repository.pullRequests.filter(
      (pr) => pr.leadTimeMins !== null && pr.mergedAt !== null,
    );
    const totalPullRequests = mergedPRs.length;
    
    let totalLeadTimeMins = 0;
    let totalPickupTimeMins = 0;
    let totalReviewTimeMins = 0;

    for (const pr of mergedPRs) {
      totalLeadTimeMins += pr.leadTimeMins!;
      
      if (pr.reviews.length > 0) {
        const firstReviewAt = pr.reviews[0].submittedAt;
        // Pickup Time: from PR creation to first review
        const pickupMins = Math.max(0, (firstReviewAt.getTime() - pr.createdAt.getTime()) / 60000);
        // Review Time: from first review to merge
        const reviewMins = Math.max(0, (pr.mergedAt!.getTime() - firstReviewAt.getTime()) / 60000);
        
        totalPickupTimeMins += pickupMins;
        totalReviewTimeMins += reviewMins;
      } else {
        // If no reviews, the entire lead time was just sitting there before merge
        totalPickupTimeMins += pr.leadTimeMins!;
        totalReviewTimeMins += 0;
      }
    }

    const avgLeadTimeMins =
      totalPullRequests > 0 ? Math.round(totalLeadTimeMins / totalPullRequests) : 0;
    const avgLeadTimeDays = Number((avgLeadTimeMins / (60 * 24)).toFixed(2));

    const avgPickupTimeHours =
      totalPullRequests > 0 ? Number((totalPickupTimeMins / totalPullRequests / 60).toFixed(1)) : 0;
    const avgReviewTimeHours =
      totalPullRequests > 0 ? Number((totalReviewTimeMins / totalPullRequests / 60).toFixed(1)) : 0;

    return {
      totalCommits,
      totalPullRequests,
      totalLinesChanged,
      avgChurnPerCommit,
      avgLeadTimeMins,
      avgLeadTimeDays,
      avgTimeToStartHours: 0, // Як вимагається, приймаємо за 0 якщо недоступно
      avgCodingTimeHours: 0,  // Приймаємо за 0
      avgPickupTimeHours,
      avgReviewTimeHours,
    };
  }

  // ─── 4. FULL SNAPSHOT ────────────────────────────────────────────────────────

  async generateSnapshot(owner: string, repo: string) {
    const repository = await this.prisma.repository.findUnique({
      where: { fullName: `${owner}/${repo}` },
    });
    if (!repository) throw new NotFoundException('Repository not found');

    const [burnoutData, graphData, processData] = await Promise.all([
      this.calculateBurnout(owner, repo),
      this.calculateSocialGraph(owner, repo),
      this.calculateProcessMetrics(owner, repo),
    ]);

    const snapshot = await this.prisma.metricSnapshot.create({
      data: {
        repositoryId: repository.id,
        burnoutData: burnoutData as any,
        graphData: graphData as any,
        processData: processData as any,
        predictionData: {},
      },
    });

    return {
      snapshotId: snapshot.id,
      burnoutData,
      graphData,
      processData,
    };
  }
}
