-- AlterTable
-- Add missing JournalApplication columns that were added to the schema but never migrated
ALTER TABLE "JournalApplication" ADD COLUMN IF NOT EXISTS "issn" TEXT;
ALTER TABLE "JournalApplication" ADD COLUMN IF NOT EXISTS "aimsAndScope" JSONB;
ALTER TABLE "JournalApplication" ADD COLUMN IF NOT EXISTS "reviewProcess" JSONB;
ALTER TABLE "JournalApplication" ADD COLUMN IF NOT EXISTS "reviewerStandards" JSONB;
ALTER TABLE "JournalApplication" ADD COLUMN IF NOT EXISTS "authorPolicies" JSONB;
