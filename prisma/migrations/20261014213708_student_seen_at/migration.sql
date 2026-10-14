-- AlterTable
ALTER TABLE "MateRequest" ADD COLUMN     "studentSeenAt" TIMESTAMP(3);
UPDATE "MateRequest" SET "studentSeenAt" = COALESCE("respondedAt", now()) WHERE "status" = 'ACCEPTED';
