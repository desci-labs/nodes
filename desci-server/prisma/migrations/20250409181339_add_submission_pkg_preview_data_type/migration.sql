/*
  Warnings:

  - You are about to drop the column `description` on the `PublicDataReference` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "DataType" ADD VALUE 'SUBMISSION_PACKAGE_PREVIEW';

-- AlterTable
ALTER TABLE "PublicDataReference" DROP COLUMN "description";
