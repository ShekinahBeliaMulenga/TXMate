-- Durable per-device push queue. Jobs are inserted in the same transaction as their Notification.
CREATE TABLE "PushNotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "pushSubscriptionId" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "providerReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PushNotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushNotificationDelivery_notificationId_pushSubscriptionId_key"
    ON "PushNotificationDelivery"("notificationId", "pushSubscriptionId");
CREATE INDEX "PushNotificationDelivery_status_nextAttemptAt_idx"
    ON "PushNotificationDelivery"("status", "nextAttemptAt");
CREATE INDEX "PushNotificationDelivery_pushSubscriptionId_status_idx"
    ON "PushNotificationDelivery"("pushSubscriptionId", "status");

ALTER TABLE "PushNotificationDelivery"
    ADD CONSTRAINT "PushNotificationDelivery_notificationId_fkey"
    FOREIGN KEY ("notificationId") REFERENCES "Notification"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PushNotificationDelivery"
    ADD CONSTRAINT "PushNotificationDelivery_pushSubscriptionId_fkey"
    FOREIGN KEY ("pushSubscriptionId") REFERENCES "PushSubscription"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
