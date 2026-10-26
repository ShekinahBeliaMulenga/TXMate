import { after } from "next/server";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import {
  dispatchPushForNotification,
  dispatchPushForRecentNotifications,
} from "./push-notification-delivery";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });
const basePrisma = new PrismaClient({ adapter });

function schedulePushDelivery(task: () => Promise<void>) {
  try {
    after(async () => {
      try {
        await task();
      } catch (error) {
        console.error("[push] Deferred notification delivery failed:", error);
      }
    });
  } catch (error) {
    // `after` only works inside a request. Background work (the session lifecycle trigger) has no
    // request, so deliver directly rather than silently skipping the browser notification.
    // Never fail a committed business operation because delivery could not be scheduled.
    console.warn("[push] No request scope for deferred delivery; sending directly:", error instanceof Error ? error.message : error);
    void task().catch((deliveryError) => console.error("[push] Direct notification delivery failed:", deliveryError));
  }
}

export const prisma = basePrisma.$extends({
  query: {
    notification: {
      async create({ args, query }) {
        const notification = await query(args);
        if (typeof notification?.id === "string") {
          const notificationId = notification.id;
          schedulePushDelivery(() =>
            dispatchPushForNotification(basePrisma, notificationId),
          );
        }
        return notification;
      },
      async createMany({ args, query }) {
        const startedAt = new Date(Date.now() - 10_000);
        const input = args.data as unknown as
          | { userId?: unknown }
          | Array<{ userId?: unknown }>;
        const records = Array.isArray(input) ? input : [input];
        const userIds = [...new Set(records.flatMap((record) =>
          typeof record?.userId === "string" ? [record.userId] : [],
        ))];
        const result = await query(args);
        if (result.count > 0 && userIds.length > 0) {
          schedulePushDelivery(() =>
            dispatchPushForRecentNotifications(basePrisma, userIds, startedAt),
          );
        }
        return result;
      },
    },
  },
});

/**
 * Sends browser/push notifications for anything created in the last few minutes that has not been
 * delivered yet. Background jobs call this once they finish, so delivery never depends on the
 * timing of a request-scoped callback relative to a transaction commit. Idempotent: notifications
 * that already have a delivery record are skipped.
 */
export async function flushRecentPushNotifications(windowMs = 3 * 60_000): Promise<void> {
  const since = new Date(Date.now() - windowMs);
  const recipients = await basePrisma.notification.findMany({
    where: { createdAt: { gte: since }, deletedAt: null },
    distinct: ["userId"],
    select: { userId: true },
    take: 500,
  });
  if (recipients.length === 0) return;
  await dispatchPushForRecentNotifications(basePrisma, recipients.map((row) => row.userId), since);
}
