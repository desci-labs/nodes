/*
  Warnings:

  - Added the required column `commitId` to the `PublishTaskQueue` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "NodeVersion" ADD COLUMN     "commitId" TEXT;

-- AlterTable
ALTER TABLE "PublishTaskQueue" ADD COLUMN     "commitId" TEXT NOT NULL;
