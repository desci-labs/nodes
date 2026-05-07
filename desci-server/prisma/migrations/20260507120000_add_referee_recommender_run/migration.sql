-- CreateTable
CREATE TABLE "RefereeRecommenderRun" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "uploadedFileName" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "originalFileName" TEXT,
    "status" TEXT NOT NULL,
    "paperTitle" TEXT,
    "paperAbstract" TEXT,
    "paperPubYear" INTEGER,
    "contextNovelty" DOUBLE PRECISION,
    "contentNovelty" DOUBLE PRECISION,
    "reviewerCount" INTEGER,
    "result" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RefereeRecommenderRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefereeRecommenderRun_userId_uploadedFileName_key" ON "RefereeRecommenderRun"("userId", "uploadedFileName");

-- CreateIndex
CREATE INDEX "RefereeRecommenderRun_userId_createdAt_idx" ON "RefereeRecommenderRun"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "RefereeRecommenderRun" ADD CONSTRAINT "RefereeRecommenderRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
