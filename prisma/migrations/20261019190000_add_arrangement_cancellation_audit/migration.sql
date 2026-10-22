-- Persist who ended a recurring arrangement and the optional reason.
ALTER TABLE "MateRequest"
ADD COLUMN "arrangementCancelledAt" TIMESTAMP(3),
ADD COLUMN "arrangementCancelledByUserId" TEXT,
ADD COLUMN "arrangementCancellationReason" TEXT;

CREATE INDEX "MateRequest_arrangementCancelledByUserId_idx"
ON "MateRequest"("arrangementCancelledByUserId");

ALTER TABLE "MateRequest"
ADD CONSTRAINT "MateRequest_arrangementCancelledByUserId_fkey"
FOREIGN KEY ("arrangementCancelledByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
