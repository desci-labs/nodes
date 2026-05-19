CREATE TABLE "BundleAutoReplenishment" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "threshold" INTEGER NOT NULL DEFAULT 5,
    "replenishmentInProgress" BOOLEAN NOT NULL DEFAULT false,
    "lastAttemptedAt" TIMESTAMP(3),
    "lastSucceededAt" TIMESTAMP(3),
    "lastFailedAt" TIMESTAMP(3),
    "lastFailureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BundleAutoReplenishment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BundleAutoReplenishment_userId_key" ON "BundleAutoReplenishment"("userId");
CREATE INDEX "BundleAutoReplenishment_isEnabled_replenishmentInProgress_idx" ON "BundleAutoReplenishment"("isEnabled", "replenishmentInProgress");

ALTER TABLE "BundleAutoReplenishment"
ADD CONSTRAINT "BundleAutoReplenishment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
