-- Preserve legacy affirmative attendance evidence as a verified result when both participants had confirmed it.
UPDATE "Attendance"
SET "status" = 'CONFIRMED'
WHERE "studentCheckedInAt" IS NOT NULL
  AND "mateConfirmedAt" IS NOT NULL
  AND "studentAttended" IS TRUE
  AND "mateConfirmedStudentAttended" IS TRUE
  AND "status" IN ('PENDING', 'STUDENT_CHECKED_IN');

-- Close legacy one-time arrangements whose completed sessions have no unresolved occurrences.
UPDATE "MateRequest" AS mr
SET "arrangementStatus" = 'COMPLETED'
WHERE mr."status" = 'ACCEPTED'
  AND mr."arrangementType" = 'ONE_TIME'
  AND mr."arrangementStatus" IN ('ACTIVE', 'PAUSED')
  AND EXISTS (
    SELECT 1
    FROM "TutoringSession" AS completed_session
    WHERE completed_session."arrangementId" = mr."id"
      AND completed_session."status" = 'COMPLETED'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "TutoringSession" AS unresolved_session
    WHERE unresolved_session."arrangementId" = mr."id"
      AND unresolved_session."status" IN ('SCHEDULED', 'IN_PROGRESS', 'DISPUTED')
  );

-- Close finite recurring arrangements that ended before this lifecycle scheduler existed.
UPDATE "MateRequest" AS mr
SET "arrangementStatus" = 'COMPLETED'
WHERE mr."status" = 'ACCEPTED'
  AND mr."arrangementType" = 'RECURRING'
  AND mr."arrangementStatus" IN ('ACTIVE', 'PAUSED')
  AND mr."recurrenceEndsAt" IS NOT NULL
  AND mr."recurrenceEndsAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
  AND NOT EXISTS (
    SELECT 1
    FROM "TutoringSession" AS unresolved_session
    WHERE unresolved_session."arrangementId" = mr."id"
      AND unresolved_session."status" IN ('SCHEDULED', 'IN_PROGRESS', 'DISPUTED')
  );
