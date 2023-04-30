-- AlterTable
ALTER TABLE "Invite" ALTER COLUMN "expiredAt" SET DEFAULT '2001-01-01 00:00:00';

-- AlterTable
ALTER TABLE "MagicLink" ALTER COLUMN "expiresAt" SET DEFAULT now() + '1 hour';

-- CreateTable
CREATE TABLE "Wallet" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "address" TEXT NOT NULL,
    "network" TEXT,
    "chainId" TEXT,
    "msgSignature" TEXT,
    "msgPlain" TEXT,
    "userId" INTEGER,

    PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Wallet.address_index" ON "Wallet"("address");

-- CreateIndex
CREATE INDEX "Wallet.userId_index" ON "Wallet"("userId");

-- AddForeignKey
ALTER TABLE "Wallet" ADD FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
