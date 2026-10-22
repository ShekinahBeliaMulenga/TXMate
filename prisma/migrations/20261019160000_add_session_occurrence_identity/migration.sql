-- Give every session a stable occurrence identity so rescheduling changes its actual
-- time without allowing the recurring scheduler to recreate the original slot.
ALTER TABLE "TutoringSession"
ADD COLUMN "occurrenceSlotStart" TIMESTAMP(3);

-- Backfill all existing rows, including one-time arrangements.
UPDATE "TutoringSession"
SET "occurrenceSlotStart" = "scheduledStart";

ALTER TABLE "TutoringSession"
ALTER COLUMN "occurrenceSlotStart" SET NOT NULL;

CREATE UNIQUE INDEX "TutoringSession_arrangementId_occurrenceSlotStart_key"
ON "TutoringSession"("arrangementId", "occurrenceSlotStart");
