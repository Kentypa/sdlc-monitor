-- CreateTable
CREATE TABLE "developers" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "email" TEXT,
    "burnoutIndex" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "developers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL,
    "githubId" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "syncedAt" TIMESTAMP(3),
    "commitCount" INTEGER NOT NULL DEFAULT 0,
    "prCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commits" (
    "id" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "additions" INTEGER NOT NULL DEFAULT 0,
    "deletions" INTEGER NOT NULL DEFAULT 0,
    "changedFiles" INTEGER NOT NULL DEFAULT 0,
    "committedAt" TIMESTAMP(3) NOT NULL,
    "isOvertime" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pull_requests" (
    "id" TEXT NOT NULL,
    "githubId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "mergedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "leadTimeMins" INTEGER,
    "headBranch" TEXT,
    "baseBranch" TEXT,
    "authorId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,

    CONSTRAINT "pull_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "githubId" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "body" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "pullRequestId" TEXT NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_snapshots" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "burnoutData" JSONB NOT NULL,
    "graphData" JSONB NOT NULL,
    "processData" JSONB NOT NULL,
    "predictionData" JSONB NOT NULL,

    CONSTRAINT "metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "developers_login_key" ON "developers"("login");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_githubId_key" ON "repositories"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_fullName_key" ON "repositories"("fullName");

-- CreateIndex
CREATE UNIQUE INDEX "commits_sha_key" ON "commits"("sha");

-- CreateIndex
CREATE INDEX "commits_authorId_idx" ON "commits"("authorId");

-- CreateIndex
CREATE INDEX "commits_repositoryId_idx" ON "commits"("repositoryId");

-- CreateIndex
CREATE INDEX "commits_committedAt_idx" ON "commits"("committedAt");

-- CreateIndex
CREATE INDEX "pull_requests_authorId_idx" ON "pull_requests"("authorId");

-- CreateIndex
CREATE INDEX "pull_requests_repositoryId_idx" ON "pull_requests"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "pull_requests_repositoryId_number_key" ON "pull_requests"("repositoryId", "number");

-- CreateIndex
CREATE INDEX "reviews_reviewerId_idx" ON "reviews"("reviewerId");

-- CreateIndex
CREATE INDEX "reviews_pullRequestId_idx" ON "reviews"("pullRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_githubId_pullRequestId_key" ON "reviews"("githubId", "pullRequestId");

-- CreateIndex
CREATE INDEX "metric_snapshots_repositoryId_idx" ON "metric_snapshots"("repositoryId");

-- CreateIndex
CREATE INDEX "metric_snapshots_calculatedAt_idx" ON "metric_snapshots"("calculatedAt");

-- AddForeignKey
ALTER TABLE "commits" ADD CONSTRAINT "commits_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "developers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commits" ADD CONSTRAINT "commits_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "developers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "developers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "pull_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
