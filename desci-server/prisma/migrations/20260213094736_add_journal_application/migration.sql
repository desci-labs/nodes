-- CreateEnum
CREATE TYPE "JournalApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "JournalApplication" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "editorialBoard" JSONB NOT NULL,
    "instructionsForAuthors" TEXT NOT NULL,
    "instructionsForReviewers" TEXT NOT NULL,
    "status" "JournalApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "applicantId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalApplication_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "JournalApplication" ADD CONSTRAINT "JournalApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
