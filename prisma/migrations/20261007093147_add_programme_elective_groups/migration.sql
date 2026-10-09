-- AlterTable
ALTER TABLE "ProgrammeCourse" ADD COLUMN     "electiveGroupId" TEXT;

-- CreateTable
CREATE TABLE "ProgrammeElectiveGroup" (
    "id" TEXT NOT NULL,
    "programmeYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minSelections" INTEGER NOT NULL DEFAULT 1,
    "maxSelections" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgrammeElectiveGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgrammeElectiveGroup_programmeYearId_idx" ON "ProgrammeElectiveGroup"("programmeYearId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgrammeElectiveGroup_programmeYearId_name_key" ON "ProgrammeElectiveGroup"("programmeYearId", "name");

-- CreateIndex
CREATE INDEX "ProgrammeCourse_electiveGroupId_idx" ON "ProgrammeCourse"("electiveGroupId");

-- AddForeignKey
ALTER TABLE "ProgrammeCourse" ADD CONSTRAINT "ProgrammeCourse_electiveGroupId_fkey" FOREIGN KEY ("electiveGroupId") REFERENCES "ProgrammeElectiveGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeElectiveGroup" ADD CONSTRAINT "ProgrammeElectiveGroup_programmeYearId_fkey" FOREIGN KEY ("programmeYearId") REFERENCES "ProgrammeYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
