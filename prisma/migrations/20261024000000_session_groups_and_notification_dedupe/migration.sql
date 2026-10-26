-- Group-session bundling: one Academic Mate slot shared by several students' sessions.
CREATE TABLE "SessionGroup" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "scheduledStart" TIMESTAMP(3) NOT NULL,
  "scheduledEnd" TIMESTAMP(3) NOT NULL,
  "mateAttendancePromptSentAt" TIMESTAMP(3),
  "mateCompletionPromptSentAt" TIMESTAMP(3),
  "mateAttendanceSubmittedAt" TIMESTAMP(3),
  "mateAttendanceSubmittedByUserId" TEXT,
  "mateCompletionSubmittedAt" TIMESTAMP(3),
  "mateCompletionSubmittedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionGroup_offeringId_scheduledStart_scheduledEnd_key"
  ON "SessionGroup"("offeringId", "scheduledStart", "scheduledEnd");
CREATE INDEX "SessionGroup_scheduledStart_idx" ON "SessionGroup"("scheduledStart");

ALTER TABLE "SessionGroup"
  ADD CONSTRAINT "SessionGroup_offeringId_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "MateOffering"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TutoringSession" ADD COLUMN "groupId" TEXT;
CREATE INDEX "TutoringSession_groupId_idx" ON "TutoringSession"("groupId");
ALTER TABLE "TutoringSession"
  ADD CONSTRAINT "TutoringSession_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "SessionGroup"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: bundle every open session by offering + exact time window.
INSERT INTO "SessionGroup" ("id", "offeringId", "scheduledStart", "scheduledEnd", "updatedAt")
SELECT gen_random_uuid()::text, mr."offeringId", s."scheduledStart", s."scheduledEnd", CURRENT_TIMESTAMP
FROM "TutoringSession" s
JOIN "MateRequest" mr ON mr."id" = s."arrangementId"
WHERE s."status" IN ('SCHEDULED', 'IN_PROGRESS', 'DISPUTED')
GROUP BY mr."offeringId", s."scheduledStart", s."scheduledEnd"
ON CONFLICT DO NOTHING;

UPDATE "TutoringSession" s
SET "groupId" = g."id"
FROM "MateRequest" mr, "SessionGroup" g
WHERE mr."id" = s."arrangementId"
  AND g."offeringId" = mr."offeringId"
  AND g."scheduledStart" = s."scheduledStart"
  AND g."scheduledEnd" = s."scheduledEnd"
  AND s."groupId" IS NULL
  AND s."status" IN ('SCHEDULED', 'IN_PROGRESS', 'DISPUTED');

-- Notification de-duplication: one row per announced event.
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
