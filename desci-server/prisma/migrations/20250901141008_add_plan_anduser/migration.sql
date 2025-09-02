/*
  Warnings:

  - You are about to alter the column `totalAmountBilled` on the `JournalBilling` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - You are about to alter the column `amount` on the `JournalInvoice` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.

*/
-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'PAST_DUE', 'TRIALING', 'UNPAID');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('FREE', 'AI_REFEREE_FINDER', 'OMNI_CHATS', 'PREMIUM');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('CARD', 'BANK_ACCOUNT', 'PAYPAL');

-- CreateEnum
CREATE TYPE "StripeInvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'UNCOLLECTIBLE', 'VOID');

-- AlterTable
ALTER TABLE "JournalBilling" ALTER COLUMN "totalAmountBilled" SET DEFAULT 0,
ALTER COLUMN "totalAmountBilled" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "JournalInvoice" ALTER COLUMN "amount" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "role" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "Subscription" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "status" "SubscriptionStatus" NOT NULL,
    "planType" "PlanType" NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripePaymentMethodId" TEXT NOT NULL,
    "type" "PaymentMethodType" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "last4" TEXT,
    "brand" TEXT,
    "expiryMonth" INTEGER,
    "expiryYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "subscriptionId" INTEGER,
    "stripeInvoiceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "StripeInvoiceStatus" NOT NULL,
    "description" TEXT,
    "invoiceUrl" TEXT,
    "pdfUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_stripeCustomerId_idx" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Subscription_stripeSubscriptionId_idx" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_stripePaymentMethodId_key" ON "PaymentMethod"("stripePaymentMethodId");

-- CreateIndex
CREATE INDEX "PaymentMethod_userId_idx" ON "PaymentMethod"("userId");

-- CreateIndex
CREATE INDEX "PaymentMethod_stripeCustomerId_idx" ON "PaymentMethod"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "PaymentMethod_stripePaymentMethodId_idx" ON "PaymentMethod"("stripePaymentMethodId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_stripeInvoiceId_key" ON "Invoice"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "Invoice_userId_idx" ON "Invoice"("userId");

-- CreateIndex
CREATE INDEX "Invoice_subscriptionId_idx" ON "Invoice"("subscriptionId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
