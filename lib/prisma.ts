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
    // Never fail a committed business operation because post-response delivery
    // could not be scheduled. The in-app notification remains available.
    console.error("[push] Could not schedule deferred notification delivery:", error);
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
