/*
  Warnings:

  - Added the required column `source` to the `AuthToken` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AuthTokenSource" AS ENUM ('ORCID');

-- AlterTable
ALTER TABLE "AuthToken" ADD COLUMN     "source" "AuthTokenSource" NOT NULL;
