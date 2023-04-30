/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `ResearchFields` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ResearchFields_name_key" ON "ResearchFields"("name");
