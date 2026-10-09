-- CreateTable
CREATE TABLE "AcademicMateVerification" (
    "id" TEXT NOT NULL,
    "academicMateProfileId" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL,
    "notes" TEXT,
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicMateVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademicMateVerification_academicMateProfileId_createdAt_idx" ON "AcademicMateVerification"("academicMateProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "AcademicMateVerification_status_createdAt_idx" ON "AcademicMateVerification"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AcademicMateVerification_reviewedByAdminId_idx" ON "AcademicMateVerification"("reviewedByAdminId");

-- AddForeignKey
ALTER TABLE "AcademicMateVerification" ADD CONSTRAINT "AcademicMateVerification_academicMateProfileId_fkey" FOREIGN KEY ("academicMateProfileId") REFERENCES "AcademicMateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicMateVerification" ADD CONSTRAINT "AcademicMateVerification_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "AdminProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
