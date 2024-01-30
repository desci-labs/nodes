/*
  Warnings:

  - Added the required column `external` to the `DraftNodeTree` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DraftNodeTree" ADD COLUMN     "external" BOOLEAN NOT NULL;
