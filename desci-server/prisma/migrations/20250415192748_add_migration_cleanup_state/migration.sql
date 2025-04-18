-- CreateEnum
CREATE TYPE "MigrationCleanupStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "DataMigration" ADD COLUMN     "cleanupStatus" "MigrationCleanupStatus" NOT NULL DEFAULT 'NOT_REQUESTED';
