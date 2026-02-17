-- CreateEnum
CREATE TYPE "StripeCheckoutFulfillmentType" AS ENUM ('BUNDLE_CHATS');

-- CreateTable
CREATE TABLE "StripeCheckoutFulfillment" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "stripeCustomerId" TEXT,
    "fulfillmentType" "StripeCheckoutFulfillmentType" NOT NULL,
    "purchasedUnits" INTEGER NOT NULL,
    "grantedUnits" INTEGER NOT NULL,
    "skipReason" TEXT,
    "details" JSONB,
    "fulfilledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeCheckoutFulfillment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StripeCheckoutFulfillment_stripeSessionId_key" ON "StripeCheckoutFulfillment"("stripeSessionId");

-- CreateIndex
CREATE INDEX "StripeCheckoutFulfillment_userId_idx" ON "StripeCheckoutFulfillment"("userId");

-- CreateIndex
CREATE INDEX "StripeCheckoutFulfillment_stripePriceId_idx" ON "StripeCheckoutFulfillment"("stripePriceId");

-- CreateIndex
CREATE INDEX "StripeCheckoutFulfillment_fulfilledAt_idx" ON "StripeCheckoutFulfillment"("fulfilledAt");

-- AddForeignKey
ALTER TABLE "StripeCheckoutFulfillment" ADD CONSTRAINT "StripeCheckoutFulfillment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
