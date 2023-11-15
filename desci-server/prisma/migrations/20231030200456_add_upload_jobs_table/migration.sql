-- CreateEnum
CREATE TYPE "UploadType" AS ENUM ('REGULAR', 'EXTERNAL_URL', 'EXTERNAL_CID');

-- CreateEnum
CREATE TYPE "ProcessingState" AS ENUM ('STARTED', 'FAILED', 'COMPLETED');

-- CreateTable
CREATE TABLE "UploadJobs" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "uploadType" "UploadType" NOT NULL,
    "uploadPayload" JSONB NOT NULL,
    "contextPath" TEXT NOT NULL,
    "storageReference" TEXT,
    "totalSize" INTEGER,
    "totalFiles" INTEGER,
    "totalDirs" INTEGER,
    "proccessingStartTime" TIMESTAMP(3),
    "processingEndTime" TIMESTAMP(3),
    "processingState" "ProcessingState",
    "nodeId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "UploadJobs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UploadJobs" ADD CONSTRAINT "UploadJobs_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadJobs" ADD CONSTRAINT "UploadJobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
