/*
  Warnings:

  - You are about to drop the column `acceptedAt` on the `EditorInvite` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "EditorInvite" DROP COLUMN "acceptedAt",
ADD COLUMN     "decisionAt" TIMESTAMP(3),
ALTER COLUMN "accepted" DROP NOT NULL,
ALTER COLUMN "accepted" DROP DEFAULT;
