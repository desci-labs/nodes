CREATE TYPE "RevenueCatPurchaseFulfillmentType" AS ENUM ('BUNDLE_CHATS', 'LIFETIME_UNLOCK');

CREATE TABLE "RevenueCatPurchaseFulfillment" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "revenueCatEventId" TEXT,
    "revenueCatTransactionId" TEXT NOT NULL,
    "revenueCatOriginalTransactionId" TEXT,
    "revenueCatProductId" TEXT NOT NULL,
    "revenueCatStore" TEXT,
    "amountPaid" DOUBLE PRECISION,
    "currency" TEXT,
    "fulfillmentType" "RevenueCatPurchaseFulfillmentType" NOT NULL,
    "purchasedUnits" INTEGER NOT NULL,
    "grantedUnits" INTEGER NOT NULL,
    "skipReason" TEXT,
    "details" JSONB,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "reversalDetails" JSONB,
    "fulfilledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueCatPurchaseFulfillment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RevenueCatPurchaseFulfillment_revenueCatTransactionId_key"
ON "RevenueCatPurchaseFulfillment"("revenueCatTransactionId");

CREATE INDEX "RevenueCatPurchaseFulfillment_userId_idx"
ON "RevenueCatPurchaseFulfillment"("userId");

CREATE INDEX "RevenueCatPurchaseFulfillment_revenueCatProductId_idx"
ON "RevenueCatPurchaseFulfillment"("revenueCatProductId");

CREATE INDEX "RevenueCatPurchaseFulfillment_fulfilledAt_idx"
ON "RevenueCatPurchaseFulfillment"("fulfilledAt");

ALTER TABLE "RevenueCatPurchaseFulfillment"
ADD CONSTRAINT "RevenueCatPurchaseFulfillment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
