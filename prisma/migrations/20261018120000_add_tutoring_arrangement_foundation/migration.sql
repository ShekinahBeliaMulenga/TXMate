-- A tutoring request becomes the arrangement after it is accepted. Every
-- session occurrence belongs to that arrangement; tutoringSession on
-- MateRequest remains a convenience relation to the initial occurrence.
CREATE TYPE "TutoringArrangementType" AS ENUM ('ONE_TIME', 'RECURRING');
CREATE TYPE "TutoringArrangementStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

ALTER TABLE "MateRequest"
  ADD COLUMN "initialSessionId" TEXT,
  ADD COLUMN "arrangementType" "TutoringArrangementType" NOT NULL DEFAULT 'ONE_TIME',
  ADD COLUMN "arrangementStatus" "TutoringArrangementStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "recurrenceEveryWeeks" INTEGER,
  ADD COLUMN "recurrenceWeekday" "Weekday",
  ADD COLUMN "recurrenceLocalStartMinute" INTEGER,
  ADD COLUMN "recurrenceTimezone" TEXT,
  ADD COLUMN "recurrenceEndsAt" TIMESTAMP(3);

ALTER TABLE "TutoringSession" ADD COLUMN "arrangementId" TEXT;

-- Preserve the existing one-session-per-request data before dropping the old FK.
UPDATE "TutoringSession"
SET "arrangementId" = "requestId";

UPDATE "MateRequest" AS r
SET "initialSessionId" = s."id"
FROM "TutoringSession" AS s
WHERE s."requestId" = r."id";

-- Classify existing arrangements from their request and initial session state.
UPDATE "MateRequest" AS r
SET "arrangementStatus" = CASE
  WHEN r."status" = 'CANCELLED' THEN 'CANCELLED'::"TutoringArrangementStatus"
  WHEN s."status" = 'CANCELLED' THEN 'CANCELLED'::"TutoringArrangementStatus"
  WHEN s."status" = 'COMPLETED' THEN 'COMPLETED'::"TutoringArrangementStatus"
  WHEN r."status" = 'ACCEPTED' THEN 'ACTIVE'::"TutoringArrangementStatus"
  ELSE 'PENDING'::"TutoringArrangementStatus"
END
FROM "TutoringSession" AS s
WHERE s."requestId" = r."id";

UPDATE "MateRequest"
SET "arrangementStatus" = 'CANCELLED'
WHERE "status" = 'CANCELLED';

-- Only open requests and live arrangements block a second request for the same offering.
DROP INDEX IF EXISTS "MateRequest_active_unique";
CREATE UNIQUE INDEX "MateRequest_active_unique"
  ON "MateRequest" ("studentProfileId", "offeringId")
  WHERE "status" IN ('REQUESTED', 'ACCEPTED')
    AND "arrangementStatus" IN ('PENDING', 'ACTIVE', 'PAUSED');

-- Replace the old one-to-one FK with a many-sessions-to-one-arrangement FK.
ALTER TABLE "TutoringSession" DROP CONSTRAINT "TutoringSession_requestId_fkey";
DROP INDEX "TutoringSession_requestId_key";
ALTER TABLE "TutoringSession" DROP COLUMN "requestId";
ALTER TABLE "TutoringSession" ALTER COLUMN "arrangementId" SET NOT NULL;

CREATE UNIQUE INDEX "MateRequest_initialSessionId_key"
  ON "MateRequest"("initialSessionId");
CREATE UNIQUE INDEX "TutoringSession_arrangementId_scheduledStart_key"
  ON "TutoringSession"("arrangementId", "scheduledStart");

CREATE INDEX "MateRequest_arrangementType_arrangementStatus_idx"
  ON "MateRequest" ("arrangementType", "arrangementStatus");

ALTER TABLE "MateRequest"
  ADD CONSTRAINT "MateRequest_initialSessionId_fkey"
  FOREIGN KEY ("initialSessionId") REFERENCES "TutoringSession"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TutoringSession"
  ADD CONSTRAINT "TutoringSession_arrangementId_fkey"
  FOREIGN KEY ("arrangementId") REFERENCES "MateRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
