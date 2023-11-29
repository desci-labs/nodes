/*
  Warnings:

  - Made the column `path` on table `DraftNodeTree` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "DraftNodeTree" ALTER COLUMN "path" SET NOT NULL;
