-- The Academic Mate sets the venue; a student can propose one for the mate to accept or decline.
ALTER TABLE "TutoringSession" ADD COLUMN "suggestedLocation" TEXT;
ALTER TABLE "TutoringSession" ADD COLUMN "suggestedLocationAt" TIMESTAMP(3);
