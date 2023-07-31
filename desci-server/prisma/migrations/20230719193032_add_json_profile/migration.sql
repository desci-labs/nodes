/*
  Warnings:

  - Added the required column `profile` to the `OrcidProfile` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "OrcidProfile" ADD COLUMN     "profile" JSONB NOT NULL;
