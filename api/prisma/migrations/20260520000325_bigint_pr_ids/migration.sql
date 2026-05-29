-- AlterTable
ALTER TABLE "pull_requests" ALTER COLUMN "githubId" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "repositories" ALTER COLUMN "githubId" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "reviews" ALTER COLUMN "githubId" SET DATA TYPE BIGINT;
