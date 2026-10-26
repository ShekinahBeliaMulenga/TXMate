-- Record who cancelled each session so cancellations are transparent to both participants.
ALTER TABLE "TutoringSession" ADD COLUMN "cancelledByUserId" TEXT;

CREATE INDEX "TutoringSession_cancelledByUserId_idx" ON "TutoringSession"("cancelledByUserId");

ALTER TABLE "TutoringSession"
  ADD CONSTRAINT "TutoringSession_cancelledByUserId_fkey"
  FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: sessions cancelled together with their arrangement share its actor and timestamp,
-- and a one-time arrangement's single session was cancelled by whoever cancelled the arrangement.
UPDATE "TutoringSession" s
SET "cancelledByUserId" = r."arrangementCancelledByUserId"
FROM "MateRequest" r
WHERE s."arrangementId" = r."id"
  AND s."status" = 'CANCELLED'
  AND s."cancelledByUserId" IS NULL
  AND r."arrangementCancelledByUserId" IS NOT NULL
  AND (s."cancelledAt" = r."arrangementCancelledAt" OR r."arrangementType" = 'ONE_TIME');
