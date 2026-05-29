import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GithubService } from '../github/github.service';
import { SyncRepositoryDto } from './dto/sync-repository.dto';

// ─── Вспомогательные функции ──────────────────────────────────────────────

/**
 * Определяет, является ли дата временем овертайма.
 * Овертайм = до 09:00 или после 19:00 по местному времени автора,
 * либо выходной день (суббота/воскресенье).
 */
function isOvertimeCommit(date: Date): boolean {
  const hour = date.getUTCHours();
  const dayOfWeek = date.getUTCDay(); // 0 = воскресенье, 6 = суббота
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isNightOrEarlyMorning = hour < 9 || hour >= 19;
  return isWeekend || isNightOrEarlyMorning;
}

/**
 * Вычисляет lead time в минутах между созданием PR и его мержем.
 */
function calcLeadTimeMins(createdAt: string, mergedAt: string | null): number | null {
  if (!mergedAt) return null;
  const created = new Date(createdAt).getTime();
  const merged = new Date(mergedAt).getTime();
  return Math.max(0, Math.round((merged - created) / 60_000));
}

// ─── Результат синхронизации ──────────────────────────────────────────────

export interface SyncResult {
  repository: string;
  commits: number;
  pullRequests: number;
  reviews: number;
  developers: number;
  skippedCommits: number;
  rateLimit: { remaining: number; limit: number };
}

@Injectable()
export class RepositoriesService {
  private readonly logger = new Logger(RepositoriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubService,
  ) {}

  // ─── Список синхронизированных репозиториев ────────────────────────────

  async findAll() {
    return this.prisma.repository.findMany({
      orderBy: { syncedAt: 'desc' },
      include: {
        _count: {
          select: { commits: true, pullRequests: true },
        },
      },
    });
  }

  // ─── Один репозиторий по fullName ──────────────────────────────────────

  async findOne(owner: string, repo: string) {
    const fullName = `${owner}/${repo}`;
    const repository = await this.prisma.repository.findUnique({
      where: { fullName },
    });
    if (!repository) {
      throw new NotFoundException(`Repository "${fullName}" not found. Run sync first.`);
    }
    return repository;
  }

  // ─── Главная функция: полная синхронизация репозитория ─────────────────

  async syncRepository(dto: SyncRepositoryDto): Promise<SyncResult> {
    // Обмежуємо ліміт: 100 комітів → 1 API запит на listCommits (замість 500 → 5 запитів)
    const { owner, repo, commitLimit = 100 } = dto;
    const fullName = `${owner}/${repo}`;
    this.logger.log(`🔄 Starting sync for ${fullName}...`);

    try {
      // 1. Получаем мета-информацию о репозитории
      let ghRepo;
      try {
        ghRepo = await this.github.getRepository(owner, repo);
      } catch (err: any) {
        if (err.status === 404) {
          throw new NotFoundException(`GitHub repository "${fullName}" not found`);
        }
        throw new BadRequestException(`GitHub API error: ${err.message}`);
      }

      // 2. Upsert репозитория в БД
      const dbRepo = await this.prisma.repository.upsert({
        where: { githubId: BigInt(ghRepo.id) },
        create: {
          githubId: BigInt(ghRepo.id),
          fullName: ghRepo.full_name,
          owner: ghRepo.owner.login,
          name: ghRepo.name,
          description: ghRepo.description,
          isPrivate: ghRepo.private,
          defaultBranch: ghRepo.default_branch,
        },
        update: {
          fullName: ghRepo.full_name,
          description: ghRepo.description,
          isPrivate: ghRepo.private,
          updatedAt: new Date(),
        },
      });

      // 3. Завантажуємо коміти (1 API запит при limit=100, без getCommit на кожен)
      const ghCommits = await this.github.fetchCommits(owner, repo, commitLimit);
      let savedCommits = 0;
      let skippedCommits = 0;

      // ── Батч-завантаження stats ТІЛЬКИ для перших 30 комітів ─────────────
      // Це замінює 500 окремих getCommit викликів → тепер максимум 30 запитів.
      // Для Code Churn метрики 30 останніх комітів достатньо (rolling window).
      const STATS_BATCH_SIZE = 30;
      const shasForStats = ghCommits
        .slice(0, STATS_BATCH_SIZE)
        .map((c) => c.sha);

      const commitStatsMap = await this.github.fetchCommitStatsBatch(
        owner,
        repo,
        shasForStats,
      );

      // ── Зберігаємо коміти у БД ────────────────────────────────────────────
      for (let i = 0; i < ghCommits.length; i++) {
        const ghCommit = ghCommits[i];

        // Фолбек для null author
        let login = ghCommit.author?.login;
        let avatarUrl = ghCommit.author?.avatar_url || '';

        if (!login) {
          if (ghCommit.commit.author?.name) {
            login = ghCommit.commit.author.name.replace(/\s+/g, '-').toLowerCase();
            avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(login)}`;
          } else {
            skippedCommits++;
            continue;
          }
        }

        try {
          // Upsert розробника
          const developer = await this.prisma.developer.upsert({
            where: { login },
            create: {
              login,
              name: ghCommit.commit.author?.name || login,
              avatarUrl,
              email: ghCommit.commit.author?.email,
            },
            update: {
              name: ghCommit.commit.author?.name ?? undefined,
            },
          });

          const committedAt = new Date(ghCommit.commit.author.date ?? Date.now());
          const isOvertime = isOvertimeCommit(committedAt);

          // Stats беремо з батч-мапи; для решти комітів — нулі (без додаткових API запитів)
          const stats = commitStatsMap.get(ghCommit.sha) ?? {
            additions: 0,
            deletions: 0,
            changedFiles: 0,
          };

          // Upsert коміту
          await this.prisma.commit.upsert({
            where: { sha: ghCommit.sha },
            create: {
              sha: ghCommit.sha,
              message: ghCommit.commit.message.slice(0, 500),
              additions: stats.additions,
              deletions: stats.deletions,
              changedFiles: stats.changedFiles,
              committedAt,
              isOvertime,
              authorId: developer.id,
              repositoryId: dbRepo.id,
            },
            update: {
              additions: stats.additions,
              deletions: stats.deletions,
              changedFiles: stats.changedFiles,
              isOvertime,
            },
          });

          savedCommits++;
        } catch (err) {
          this.logger.warn(`Skipping commit ${ghCommit.sha}: ${err}`);
          skippedCommits++;
        }
      }

    this.logger.log(`✅ Saved ${savedCommits} commits (skipped: ${skippedCommits})`);

    // 4. Завантажуємо Pull Requests
    // prLimit = 50: 1 API запит на fetchPullRequests (не більше 50 PRs)
    const prLimit = 50;
    const ghPRs = await this.github.fetchPullRequests(owner, repo, prLimit);
    let savedPRs = 0;
    let savedReviews = 0;

    for (const ghPR of ghPRs) {
      if (!ghPR.user?.login) continue;

      try {
        // Upsert автора PR
        const author = await this.prisma.developer.upsert({
          where: { login: ghPR.user.login },
          create: {
            login: ghPR.user.login,
            avatarUrl: ghPR.user.avatar_url,
          },
          update: {
            avatarUrl: ghPR.user.avatar_url,
          },
        });

        // Upsert PR
        const dbPR = await this.prisma.pullRequest.upsert({
          where: {
            repositoryId_number: {
              repositoryId: dbRepo.id,
              number: ghPR.number,
            },
          },
          create: {
            githubId: BigInt(ghPR.id),
            number: ghPR.number,
            title: ghPR.title,
            state: ghPR.merged_at ? 'merged' : ghPR.state,
            createdAt: new Date(ghPR.created_at),
            updatedAt: new Date(ghPR.updated_at),
            mergedAt: ghPR.merged_at ? new Date(ghPR.merged_at) : null,
            closedAt: ghPR.closed_at ? new Date(ghPR.closed_at) : null,
            leadTimeMins: calcLeadTimeMins(ghPR.created_at, ghPR.merged_at),
            headBranch: ghPR.head.ref,
            baseBranch: ghPR.base.ref,
            authorId: author.id,
            repositoryId: dbRepo.id,
          },
          update: {
            state: ghPR.merged_at ? 'merged' : ghPR.state,
            mergedAt: ghPR.merged_at ? new Date(ghPR.merged_at) : null,
            closedAt: ghPR.closed_at ? new Date(ghPR.closed_at) : null,
            leadTimeMins: calcLeadTimeMins(ghPR.created_at, ghPR.merged_at),
          },
        });

        savedPRs++;

        // 5. Завантажуємо рев'ю тільки для merged PRs і не більше 50 разів.
        // Це скорочує reviews-запити: замість N×PR → максимум 50 API запитів.
        const isMerged = !!ghPR.merged_at;
        if (!isMerged || savedReviews > 50) continue;

        const ghReviews = await this.github.fetchReviewsForPR(owner, repo, ghPR.number);

        for (const ghReview of ghReviews) {
          if (!ghReview.user?.login || !ghReview.submitted_at) continue;

          try {
            // Upsert ревьювера
            const reviewer = await this.prisma.developer.upsert({
              where: { login: ghReview.user.login },
              create: {
                login: ghReview.user.login,
                avatarUrl: ghReview.user.avatar_url,
              },
              update: { avatarUrl: ghReview.user.avatar_url },
            });

            await this.prisma.review.upsert({
              where: {
                githubId_pullRequestId: {
                  githubId: BigInt(ghReview.id),
                  pullRequestId: dbPR.id,
                },
              },
              create: {
                githubId: BigInt(ghReview.id),
                state: ghReview.state,
                body: ghReview.body?.slice(0, 1000) ?? null,
                submittedAt: new Date(ghReview.submitted_at),
                reviewerId: reviewer.id,
                pullRequestId: dbPR.id,
              },
              update: {
                state: ghReview.state,
              },
            });

            savedReviews++;
          } catch (err) {
            this.logger.warn(`Skipping review ${ghReview.id}: ${err}`);
          }
        }
      } catch (err) {
        this.logger.warn(`Skipping PR #${ghPR.number}: ${err}`);
      }
    }

    this.logger.log(`✅ Saved ${savedPRs} PRs, ${savedReviews} reviews`);

    // 6. Подсчитываем уникальных разработчиков
    const devCount = await this.prisma.developer.count({
      where: {
        commits: { some: { repositoryId: dbRepo.id } },
      },
    });

    // 7. Обновляем статус репозитория
    await this.prisma.repository.update({
      where: { id: dbRepo.id },
      data: {
        syncedAt: new Date(),
        commitCount: savedCommits,
        prCount: savedPRs,
      },
    });

    // 8. Проверяем оставшийся rate limit
    const rateLimit = await this.github.getRateLimit();
    this.logger.log(
      `GitHub API: ${rateLimit.remaining}/${rateLimit.limit} requests remaining`,
    );

      return {
        repository: fullName,
        commits: savedCommits,
        pullRequests: savedPRs,
        reviews: savedReviews,
        developers: devCount,
        skippedCommits,
        rateLimit: {
          remaining: rateLimit.remaining,
          limit: rateLimit.limit,
        },
      };
    } catch (error: any) {
      this.logger.error(`❌ Sync Failed for ${fullName}:`, error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error; // прокидаємо відомі помилки
      }
      // Перехоплення помилок лімітів GitHub
      if (error.status === 403 || error.status === 429) {
        throw new HttpException('GitHub API rate limit exceeded. Please add GITHUB_TOKEN.', HttpStatus.TOO_MANY_REQUESTS);
      }
      throw new InternalServerErrorException(`Sync failed: ${error.message}`);
    }
  }
}
