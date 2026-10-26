ALTER TABLE "TutoringSession"
  ADD COLUMN "studentCompletionConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "mateCompletionConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "completionPromptSentAt" TIMESTAMP(3),
  ADD COLUMN "completionDisputedAt" TIMESTAMP(3),
  ADD COLUMN "completionDisputedByUserId" TEXT,
  ADD COLUMN "completionDisputeReason" TEXT,
  ADD COLUMN "completionReviewRequiredAt" TIMESTAMP(3);

ALTER TABLE "Attendance"
  ADD COLUMN "studentAttended" BOOLEAN,
  ADD COLUMN "studentRespondedAt" TIMESTAMP(3),
  ADD COLUMN "mateConfirmedStudentAttended" BOOLEAN,
  ADD COLUMN "mateRespondedAt" TIMESTAMP(3),
  ADD COLUMN "studentAttendancePromptSentAt" TIMESTAMP(3),
  ADD COLUMN "mateAttendancePromptSentAt" TIMESTAMP(3);

CREATE INDEX "TutoringSession_completionReviewRequiredAt_status_idx"
  ON "TutoringSession"("completionReviewRequiredAt", "status");

-- Preserve legacy affirmative attendance evidence when moving to the explicit response model.
UPDATE "Attendance"
SET "studentAttended" = TRUE,
    "studentRespondedAt" = "studentCheckedInAt"
WHERE "studentCheckedInAt" IS NOT NULL
  AND "studentRespondedAt" IS NULL;

UPDATE "Attendance"
SET "mateConfirmedStudentAttended" = TRUE,
    "mateRespondedAt" = "mateConfirmedAt"
WHERE "mateConfirmedAt" IS NOT NULL
  AND "mateRespondedAt" IS NULL;

ALTER TABLE "TutoringSession"
  ADD CONSTRAINT "TutoringSession_completionDisputedByUserId_fkey"
  FOREIGN KEY ("completionDisputedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
