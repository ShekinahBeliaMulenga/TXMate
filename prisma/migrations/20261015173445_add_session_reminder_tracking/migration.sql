-- AlterTable
ALTER TABLE "TutoringSession" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TutoringSession_status_reminderSentAt_scheduledStart_idx" ON "TutoringSession"("status", "reminderSentAt", "scheduledStart");
