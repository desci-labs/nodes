-- CreateEnum
CREATE TYPE "SentEmailType" AS ENUM ('SCIWEAVE_14_DAY_INACTIVITY', 'REFEREE_REVIEW_REMINDER', 'OVERDUE_REVIEW_ALERT');

-- CreateTable
CREATE TABLE "SentEmail" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "emailType" "SentEmailType" NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SentEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SentEmail_userId_emailType_idx" ON "SentEmail"("userId", "emailType");

-- CreateIndex
CREATE INDEX "SentEmail_userId_emailType_createdAt_idx" ON "SentEmail"("userId", "emailType", "createdAt");

-- AddForeignKey
ALTER TABLE "SentEmail" ADD CONSTRAINT "SentEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
