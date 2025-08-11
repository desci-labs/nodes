-- CreateEnum
CREATE TYPE "Feature" AS ENUM ('REFEREE_FINDER');

-- CreateEnum
CREATE TYPE "PlanCodename" AS ENUM ('CUSTOM', 'FREE', 'STARTER', 'PRO');

-- CreateEnum
CREATE TYPE "Period" AS ENUM ('DAY', 'WEEK', 'MONTH', 'YEAR');

-- CreateTable
CREATE TABLE "UserFeatureLimit" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "planCodename" "PlanCodename" NOT NULL,
    "feature" "Feature" NOT NULL,
    "period" "Period" NOT NULL,
    "useLimit" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFeatureLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserFeatureLimit_userId_feature_isActive_idx" ON "UserFeatureLimit"("userId", "feature", "isActive");

-- AddForeignKey
ALTER TABLE "UserFeatureLimit" ADD CONSTRAINT "UserFeatureLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
