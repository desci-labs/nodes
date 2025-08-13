-- CreateEnum
CREATE TYPE "ExternalApi" AS ENUM ('REFEREE_FINDER');

-- CreateTable
CREATE TABLE "ExternalApiUsage" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "apiType" "ExternalApi" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "data" JSONB,

    CONSTRAINT "ExternalApiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalApiUsage_userId_idx" ON "ExternalApiUsage"("userId");

-- CreateIndex
CREATE INDEX "ExternalApiUsage_userId_apiType_idx" ON "ExternalApiUsage"("userId", "apiType");

-- CreateIndex
CREATE INDEX "ExternalApiUsage_userId_apiType_createdAt_idx" ON "ExternalApiUsage"("userId", "apiType", "createdAt");

-- AddForeignKey
ALTER TABLE "ExternalApiUsage" ADD CONSTRAINT "ExternalApiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
