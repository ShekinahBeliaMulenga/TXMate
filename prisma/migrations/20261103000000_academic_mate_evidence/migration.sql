-- Documents an Academic Mate uploads to prove their identity (private storage, reviewed one by one).
CREATE TYPE "EvidenceKind" AS ENUM ('STUDENT_ID', 'PROOF_OF_ENROLMENT', 'ACADEMIC_RESULTS');
CREATE TYPE "EvidenceReview" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

CREATE TABLE "AcademicMateEvidence" (
    "id" TEXT NOT NULL,
    "academicMateProfileId" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "reviewStatus" "EvidenceReview" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "purgeAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicMateEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcademicMateEvidence_storageKey_key" ON "AcademicMateEvidence"("storageKey");
CREATE UNIQUE INDEX "AcademicMateEvidence_academicMateProfileId_sha256_key" ON "AcademicMateEvidence"("academicMateProfileId", "sha256");
CREATE INDEX "AcademicMateEvidence_academicMateProfileId_kind_idx" ON "AcademicMateEvidence"("academicMateProfileId", "kind");
CREATE INDEX "AcademicMateEvidence_purgeAfter_idx" ON "AcademicMateEvidence"("purgeAfter");

ALTER TABLE "AcademicMateEvidence" ADD CONSTRAINT "AcademicMateEvidence_academicMateProfileId_fkey" FOREIGN KEY ("academicMateProfileId") REFERENCES "AcademicMateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademicMateEvidence" ADD CONSTRAINT "AcademicMateEvidence_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "AdminProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
