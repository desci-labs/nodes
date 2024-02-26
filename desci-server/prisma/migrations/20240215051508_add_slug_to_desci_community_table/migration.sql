/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `DesciCommunity` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "DesciCommunity" ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DesciCommunity_slug_key" ON "DesciCommunity"("slug");
