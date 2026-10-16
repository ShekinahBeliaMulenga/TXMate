-- CreateEnum
CREATE TYPE "RescheduleRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "NotificationChannel" ADD VALUE 'PUSH';

-- CreateTable
CREATE TABLE "SessionRescheduleRequest" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "proposedByUserId" TEXT NOT NULL,
    "respondingUserId" TEXT NOT NULL,
    "proposedStart" TIMESTAMP(3) NOT NULL,
    "proposedEnd" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "RescheduleRequestStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionRescheduleRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionRescheduleRequest_sessionId_status_idx" ON "SessionRescheduleRequest"("sessionId", "status");

-- CreateIndex
CREATE INDEX "SessionRescheduleRequest_respondingUserId_status_idx" ON "SessionRescheduleRequest"("respondingUserId", "status");

-- AddForeignKey
ALTER TABLE "SessionRescheduleRequest" ADD CONSTRAINT "SessionRescheduleRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TutoringSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRescheduleRequest" ADD CONSTRAINT "SessionRescheduleRequest_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRescheduleRequest" ADD CONSTRAINT "SessionRescheduleRequest_respondingUserId_fkey" FOREIGN KEY ("respondingUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
