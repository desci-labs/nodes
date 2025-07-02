/*
  Warnings:

  - A unique constraint covering the columns `[journalId,formUuid,version]` on the table `JournalFormTemplate` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `formUuid` to the `JournalFormTemplate` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "JournalFormTemplate" ADD COLUMN     "formUuid" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "JournalFormTemplate_journalId_formUuid_version_key" ON "JournalFormTemplate"("journalId", "formUuid", "version");
