-- AlterTable
ALTER TABLE "JournalSubmissionReview" ALTER COLUMN "recommendation" DROP NOT NULL,
ALTER COLUMN "submittedAt" DROP NOT NULL,
ALTER COLUMN "submittedAt" DROP DEFAULT;
