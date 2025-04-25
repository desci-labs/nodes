-- CreateEnum
CREATE TYPE "MigrationType" AS ENUM ('PRIVATE_TO_PUBLIC', 'GUEST_TO_PRIVATE');

-- CreateEnum
CREATE TYPE "MigrationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Node" ADD COLUMN     "dataMigrationId" INTEGER;

-- CreateTable
CREATE TABLE "DataMigration" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "migrationType" "MigrationType" NOT NULL,
    "migrationStatus" "MigrationStatus" NOT NULL,
    "migrationError" TEXT,
    "migrationData" JSONB NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "DataMigration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DataMigrationToNode" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_DataMigrationToNode_AB_unique" ON "_DataMigrationToNode"("A", "B");

-- CreateIndex
CREATE INDEX "_DataMigrationToNode_B_index" ON "_DataMigrationToNode"("B");

-- AddForeignKey
ALTER TABLE "DataMigration" ADD CONSTRAINT "DataMigration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DataMigrationToNode" ADD CONSTRAINT "_DataMigrationToNode_A_fkey" FOREIGN KEY ("A") REFERENCES "DataMigration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DataMigrationToNode" ADD CONSTRAINT "_DataMigrationToNode_B_fkey" FOREIGN KEY ("B") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
