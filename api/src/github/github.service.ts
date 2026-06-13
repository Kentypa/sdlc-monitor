import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Octokit } from '@octokit/rest';

export interface GithubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string | null;
      email: string | null;
      date: string | null;
    };
  };
  author: {
    login: string;
    id: number;
    avatar_url: string;
  } | null;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
  files?: Array<{ filename: string }>;
}

export interface GithubPullRequest {
  id: number;
  number: number;
  title: string;
  state: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  head: { ref: string };
  base: { ref: string };
  user: {
    login: string;
    id: number;
    avatar_url: string;
  } | null;
}

export interface GithubReview {
  id: number;
  state: string;
  body: string | null;
  submitted_at: string | null;
  user: {
    login: string;
    id: number;
    avatar_url: string;
  } | null;
}

export interface GithubRepo {
  id: number;
  full_name: string;
  owner: { login: string };
  name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
}

export interface CommitStats {
  sha: string;
  additions: number;
  deletions: number;
  changedFiles: number;
}

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);
  private readonly octokit: Octokit;

  constructor(private readonly configService: ConfigService) {
    let token = process.env.GITHUB_TOKEN || this.configService.get<string>('GITHUB_TOKEN');
    if (token) {
      token = token.replace(/^['\"]|['\"]$/g, '');
    }
    console.log(`[GithubService] Token loaded: ${token ? 'YES (Length: ' + token.length + ')' : 'NO'}`);

    this.octokit = new Octokit({
      auth: token || undefined,
      log: {
        debug: () => { },
        info: () => { },
        warn: (msg: string) => this.logger.warn(msg),
        error: (msg: string) => this.logger.error(msg),
      },
    });
  }

  async getRepository(owner: string, repo: string): Promise<GithubRepo> {
    this.logger.log(`Fetching repo metadata: ${owner}/${repo}`);
    const { data } = await this.octokit.repos.get({ owner, repo });
    return data as GithubRepo;
  }

  async fetchCommits(
    owner: string,
    repo: string,
    limit: number = 100,
  ): Promise<GithubCommit[]> {
    this.logger.log(`Fetching up to ${limit} commits from ${owner}/${repo}...`);
    const allCommits: GithubCommit[] = [];
    const perPage = Math.min(100, limit);
    let page = 1;

    while (allCommits.length < limit) {
      const remaining = limit - allCommits.length;
      const pageSize = Math.min(perPage, remaining);

      const { data } = await this.octokit.repos.listCommits({
        owner,
        repo,
        per_page: pageSize,
        page,
      });

      if (data.length === 0) break;

      const validCommits = data.filter(
        (c) => c.author !== null && c.author.login,
      ) as GithubCommit[];

      allCommits.push(...validCommits);
      this.logger.debug(`Page ${page}: got ${data.length} commits (${validCommits.length} with author)`);

      if (data.length < pageSize) break;
      page++;
    }

    this.logger.log(`Fetched ${allCommits.length} commits total (${page} API call(s))`);
    return allCommits.slice(0, limit);
  }

  async fetchCommitStatsBatch(
    owner: string,
    repo: string,
    shas: string[],
  ): Promise<Map<string, CommitStats>> {
    const result = new Map<string, CommitStats>();
    this.logger.log(`Fetching detailed stats for ${shas.length} commits (sequential)...`);

    for (const sha of shas) {
      try {
        const { data } = await this.octokit.repos.getCommit({ owner, repo, ref: sha });
        result.set(sha, {
          sha,
          additions: data.stats?.additions ?? 0,
          deletions: data.stats?.deletions ?? 0,
          changedFiles: data.files?.length ?? 0,
        });
      } catch {
        result.set(sha, { sha, additions: 0, deletions: 0, changedFiles: 0 });
      }
    }

    this.logger.log(`Fetched stats for ${result.size} commits`);
    return result;
  }

  async fetchPullRequests(
    owner: string,
    repo: string,
    limit: number = 100,
  ): Promise<GithubPullRequest[]> {
    this.logger.log(`Fetching pull requests from ${owner}/${repo} (limit: ${limit})...`);
    const allPRs: GithubPullRequest[] = [];

    for (const state of ['closed', 'open'] as const) {
      if (allPRs.length >= limit) break;

      const stateLimit = state === 'closed'
        ? Math.ceil(limit * 0.8)
        : Math.ceil(limit * 0.2);
      let page = 1;
      let stateCount = 0;

      while (stateCount < stateLimit && allPRs.length < limit) {
        const remaining = Math.min(stateLimit - stateCount, limit - allPRs.length);
        const pageSize = Math.min(100, remaining);

        const { data } = await this.octokit.pulls.list({
          owner,
          repo,
          state,
          per_page: pageSize,
          page,
          sort: 'updated',
          direction: 'desc',
        });

        if (data.length === 0) break;

        const validPRs = data.filter((pr) => {
          if (!pr.user) return false;
          if (state === 'closed') return pr.merged_at !== null;
          return true;
        }) as GithubPullRequest[];

        allPRs.push(...validPRs);
        stateCount += validPRs.length;

        if (data.length < pageSize) break;
        page++;
      }

      this.logger.debug(`State '${state}': fetched ${stateCount} PRs`);
    }

    this.logger.log(`Fetched ${allPRs.length} pull requests total (closed/merged first)`);
    return allPRs.slice(0, limit);
  }

  async fetchReviewsForPR(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<GithubReview[]> {
    try {
      const { data } = await this.octokit.pulls.listReviews({
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      });
      return data.filter((r) => r.user !== null) as GithubReview[];
    } catch (error) {
      this.logger.warn(`Failed to fetch reviews for PR #${prNumber}: ${error}`);
      return [];
    }
  }

  async getRateLimit(): Promise<{ remaining: number; limit: number; reset: Date }> {
    const { data } = await this.octokit.rateLimit.get();
    return {
      remaining: data.rate.remaining,
      limit: data.rate.limit,
      reset: new Date(data.rate.reset * 1000),
    };
  }
}
