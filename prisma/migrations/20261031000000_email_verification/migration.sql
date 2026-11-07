-- Email verification: single-use link records.
CREATE TABLE "UsedEmailToken" (
    "tokenHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsedEmailToken_pkey" PRIMARY KEY ("tokenHash")
);

CREATE INDEX "UsedEmailToken_expiresAt_idx" ON "UsedEmailToken"("expiresAt");

-- Accounts whose email was never verified keep all of their data and can still verify and sign in.
-- Their existing sign-in sessions are ended, so "verified email required" also applies to people already signed in.
-- Nothing is marked verified here; each person verifies through the emailed link.
DELETE FROM "session" WHERE "userId" IN (SELECT "id" FROM "User" WHERE "emailVerified" = false);
