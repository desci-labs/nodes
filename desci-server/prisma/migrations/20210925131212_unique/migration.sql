/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `Vault` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Vault.name_unique" ON "Vault"("name");
