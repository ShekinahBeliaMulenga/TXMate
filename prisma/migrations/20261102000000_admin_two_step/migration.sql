-- Two-step sign-in for admins (authenticator app + backup codes).
-- Existing admin sign-ins have no verification row, so every admin is taken through setup on their next visit.

CREATE TABLE "AdminTwoFactor" (
    "id" TEXT NOT NULL,
    "adminProfileId" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "lastUsedStep" INTEGER,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminTwoFactor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminBackupCode" (
    "id" TEXT NOT NULL,
    "twoFactorId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminBackupCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminSessionMfa" (
    "sessionId" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,

    CONSTRAINT "AdminSessionMfa_pkey" PRIMARY KEY ("sessionId")
);

CREATE UNIQUE INDEX "AdminTwoFactor_adminProfileId_key" ON "AdminTwoFactor"("adminProfileId");
CREATE UNIQUE INDEX "AdminBackupCode_twoFactorId_codeHash_key" ON "AdminBackupCode"("twoFactorId", "codeHash");

ALTER TABLE "AdminTwoFactor" ADD CONSTRAINT "AdminTwoFactor_adminProfileId_fkey" FOREIGN KEY ("adminProfileId") REFERENCES "AdminProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminBackupCode" ADD CONSTRAINT "AdminBackupCode_twoFactorId_fkey" FOREIGN KEY ("twoFactorId") REFERENCES "AdminTwoFactor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminSessionMfa" ADD CONSTRAINT "AdminSessionMfa_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
