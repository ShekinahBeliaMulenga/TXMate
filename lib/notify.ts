/**
 * Duplicate-proof in-app notifications.
 *
 * Every notification that announces a one-off event carries a `dedupeKey`
 * (for example `att:student:<sessionId>`). The unique index on that column plus
 * `skipDuplicates` means a retried cron run, a double-click or two racing requests
 * can never create the same notification twice. Push delivery is triggered by the
 * Prisma extension in `lib/prisma.ts` and only fires when rows were really created.
 */
import type { prisma as PrismaInstance } from "@/lib/prisma";

type Db = Pick<typeof PrismaInstance, "notification">;
type NotificationType = "SYSTEM" | "SESSION_COMPLETED" | "SESSION_REMINDER" | "SESSION_CANCELLED" | "REVIEW_RECEIVED";

export type OnceNotification = {
  userId: string;
  dedupeKey: string;
  type?: NotificationType;
  title: string;
  body: string;
  /** Internal path the notification opens, e.g. /student/sessions/<id>. Must start with "/". */
  url: string;
  data?: Record<string, string | number | boolean | null>;
};

export function safeInternalUrl(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/student/sessions";
}

/** Creates the notifications that do not exist yet. Returns how many were actually created. */
export async function notifyOnce(db: Db, items: OnceNotification[]): Promise<number> {
  if (items.length === 0) return 0;
  const result = await db.notification.createMany({
    data: items.map((item) => {
      const url = safeInternalUrl(item.url);
      return {
        userId: item.userId,
        dedupeKey: item.dedupeKey,
        type: item.type ?? "SYSTEM",
        title: item.title,
        body: item.body,
        data: { ...(item.data ?? {}), url },
      };
    }),
    skipDuplicates: true,
  });
  return result.count;
}

export const sessionUrl = (sessionId: string) => `/student/sessions?session=${encodeURIComponent(sessionId)}`;
export const groupUrl = (groupId: string) => `/student/sessions?group=${encodeURIComponent(groupId)}`;
