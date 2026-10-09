/*
  Warnings:

  - A unique constraint covering the columns `[mateOfferingId,day,startMinute,endMinute]` on the table `MateAvailability` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `mateOfferingId` to the `MateAvailability` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "MateAvailability_academicMateProfileId_day_startMinute_endM_key";

-- DropIndex
DROP INDEX "MateAvailability_day_startMinute_endMinute_idx";

-- AlterTable
ALTER TABLE "MateAvailability" ADD COLUMN     "mateOfferingId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "MateAvailability_academicMateProfileId_day_idx" ON "MateAvailability"("academicMateProfileId", "day");

-- CreateIndex
CREATE INDEX "MateAvailability_mateOfferingId_day_idx" ON "MateAvailability"("mateOfferingId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "MateAvailability_mateOfferingId_day_startMinute_endMinute_key" ON "MateAvailability"("mateOfferingId", "day", "startMinute", "endMinute");

-- AddForeignKey
ALTER TABLE "MateAvailability" ADD CONSTRAINT "MateAvailability_mateOfferingId_fkey" FOREIGN KEY ("mateOfferingId") REFERENCES "MateOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;
