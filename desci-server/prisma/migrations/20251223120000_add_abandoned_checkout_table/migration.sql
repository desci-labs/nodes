-- CreateTable
CREATE TABLE "AbandonedCheckout" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "priceId" TEXT,
    "completedAt" TIMESTAMP(3),
    "firstEmailSentAt" TIMESTAMP(3),
    "couponCode" TEXT,
    "couponExpiresAt" TIMESTAMP(3),
    "reminderEmailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbandonedCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AbandonedCheckout_stripeSessionId_key" ON "AbandonedCheckout"("stripeSessionId");

-- CreateIndex
CREATE INDEX "AbandonedCheckout_userId_idx" ON "AbandonedCheckout"("userId");

-- CreateIndex
CREATE INDEX "AbandonedCheckout_completedAt_idx" ON "AbandonedCheckout"("completedAt");

-- CreateIndex
CREATE INDEX "AbandonedCheckout_firstEmailSentAt_idx" ON "AbandonedCheckout"("firstEmailSentAt");

-- CreateIndex
CREATE INDEX "AbandonedCheckout_couponExpiresAt_idx" ON "AbandonedCheckout"("couponExpiresAt");

-- CreateIndex
CREATE INDEX "AbandonedCheckout_createdAt_completedAt_idx" ON "AbandonedCheckout"("createdAt", "completedAt");

-- AddForeignKey
ALTER TABLE "AbandonedCheckout" ADD CONSTRAINT "AbandonedCheckout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

