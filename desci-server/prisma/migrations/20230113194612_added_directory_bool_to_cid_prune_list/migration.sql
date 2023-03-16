/*
  Warnings:

  - Added the required column `directory` to the `CidPruneList` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CidPruneList" ADD COLUMN     "directory" BOOLEAN NOT NULL;
