-- CreateEnum
CREATE TYPE "SupportCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
CREATE TYPE "SupportCasePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');
CREATE TYPE "SupportCaseCategory" AS ENUM ('ACCOUNT', 'TUTORING', 'CONDUCT', 'TECHNICAL', 'OTHER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "anonymisedAt" TIMESTAMP(3);
ALTER TABLE "Review" ADD COLUMN "hiddenAt" TIMESTAMP(3), ADD COLUMN "hiddenByAdminId" TEXT, ADD COLUMN "hiddenReason" TEXT;

-- CreateTable
CREATE TABLE "SupportCase" (
    "id" TEXT NOT NULL,
    "universityId" TEXT,
    "subjectUserId" TEXT,
    "category" "SupportCaseCategory" NOT NULL DEFAULT 'OTHER',
    "priority" "SupportCasePriority" NOT NULL DEFAULT 'NORMAL',
    "status" "SupportCaseStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedAdminId" TEXT,
    "resolution" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportCaseNote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportCaseNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Review_hiddenAt_idx" ON "Review"("hiddenAt");
CREATE INDEX "SupportCase_status_priority_createdAt_idx" ON "SupportCase"("status", "priority", "createdAt");
CREATE INDEX "SupportCase_universityId_status_idx" ON "SupportCase"("universityId", "status");
CREATE INDEX "SupportCase_subjectUserId_idx" ON "SupportCase"("subjectUserId");
CREATE INDEX "SupportCase_assignedAdminId_status_idx" ON "SupportCase"("assignedAdminId", "status");
CREATE INDEX "SupportCaseNote_caseId_createdAt_idx" ON "SupportCaseNote"("caseId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "AdminProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportCaseNote" ADD CONSTRAINT "SupportCaseNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SupportCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
