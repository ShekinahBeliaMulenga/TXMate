-- Notifications are hidden, not removed, so their dedupeKey keeps blocking duplicates.
ALTER TABLE "Notification" ADD COLUMN "deletedAt" TIMESTAMP(3);
