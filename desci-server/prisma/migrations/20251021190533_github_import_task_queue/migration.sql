-- CreateEnum
CREATE TYPE "ImportTaskQueueStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "ImportTaskQueue" (
    "id" SERIAL NOT NULL,
    "jobId" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "ImportTaskQueueStatus" NOT NULL DEFAULT 'PENDING',
    "parsedDocument" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER DEFAULT 0,

    CONSTRAINT "ImportTaskQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportTaskQueue_jobId_key" ON "ImportTaskQueue"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportTaskQueue_uuid_key" ON "ImportTaskQueue"("uuid");
