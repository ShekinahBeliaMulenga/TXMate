import type { PrismaClient } from "../generated/prisma/client";

type NotificationRecord = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
};

type SubscriptionRecord = {
  id: string;
  userId: string;
  fid: string;
};

function isValidFcmToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 100 && value.length <= 4096;
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

type SafePushError = { code: string | null; causeCode: string | null; summary: string };

function getSafePushError(error: unknown): SafePushError {
  const root = asRecord(error);
  const cause = asRecord(root.cause);
  const rawCode = typeof root.code === "string" ? root.code : null;
  const rawCauseCode = typeof cause.code === "string" ? cause.code : null;
  const code = rawCode && /^[A-Za-z0-9/_-]{1,80}$/.test(rawCode) ? rawCode : null;
  const causeCode = rawCauseCode && /^[A-Za-z0-9/_-]{1,80}$/.test(rawCauseCode) ? rawCauseCode : null;

  // Never log the provider error object or its message: Firebase's HTTP error
  // object can contain Authorization headers and other request configuration.
  if (causeCode === "ENOTFOUND" || causeCode === "EAI_AGAIN") {
    return { code, causeCode, summary: `Firebase DNS lookup failed (${causeCode}) for fcm.googleapis.com; check DNS resolution and outbound HTTPS on port 443.` };
  }
  if (["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH"].includes(causeCode ?? "") || code === "app/network-error") {
    return { code, causeCode, summary: `Firebase push network request failed${causeCode ? ` (${causeCode})` : ""}; check connectivity to fcm.googleapis.com:443.` };
  }
  if (code?.startsWith("messaging/")) {
    return { code, causeCode, summary: `Firebase Cloud Messaging rejected the push (${code}); provider details redacted.` };
  }
  return { code, causeCode, summary: `Firebase push failed${code ? ` (${code})` : ""}; provider details redacted.` };
}

function isTransientPushError(error: unknown): boolean {
  const details = getSafePushError(error);
  return details.code === "app/network-error" || [
    "ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH",
  ].includes(details.causeCode ?? "") || [
    "messaging/server-unavailable", "messaging/internal-error", "messaging/quota-exceeded",
  ].includes(details.code ?? "");
}

async function sendWithTransientRetry<T>(send: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      return await send();
    } catch (error) {
      if (attempt >= maxAttempts || !isTransientPushError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** (attempt - 1)));
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function notificationUrl(type: string, data: Record<string, unknown>): string {
  const isSafeInternalUrl = (value: unknown): value is string =>
    typeof value === "string" && value.startsWith("/") && !value.startsWith("//") &&
    !value.includes("\\") && !/[\r\n\u0000-\u001f]/.test(value);
  if (isSafeInternalUrl(data.url)) return data.url;
  if (isSafeInternalUrl(data.conversationUrl)) return data.conversationUrl;
  if (type === "NEW_MESSAGE") return "/student/messages";
  if (type === "MATE_REQUEST") return "/student/academic-mate/requests";
  if (typeof data.sessionId === "string") return "/student/sessions";
  if (typeof data.requestId === "string") return "/student/requests";
  return "/";
}

function firebaseData(notification: NotificationRecord): Record<string, string> {
  const source = asRecord(notification.data);
  const result: Record<string, string> = {};
  let totalLength = 0;
  for (const [key, value] of Object.entries(source)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)) continue;
    if (key.toLowerCase().startsWith("google") || key === "from" || key === "message_type") continue;
    if (value !== null && typeof value === "object") continue;
    const text = String(value ?? "").slice(0, 400);
    if (totalLength + key.length + text.length > 2200) break;
    result[key] = text;
    totalLength += key.length + text.length;
  }
  result.notificationId = notification.id;
  result.type = notification.type;
  result.url = notificationUrl(notification.type, source);
  return result;
}

async function getUndeliveredNotifications(
  db: PrismaClient,
  where: { id?: { in: string[] }; userId?: { in: string[] }; createdAt?: { gte: Date } },
): Promise<NotificationRecord[]> {
  return db.notification.findMany({
    where: {
      ...where,
      deliveries: { none: { channel: "PUSH" } },
    },
    select: { id: true, userId: true, type: true, title: true, body: true, data: true },
  });
}

async function processNotifications(db: PrismaClient, notifications: NotificationRecord[]) {
  if (!notifications.length) return;

  const userIds = [...new Set(notifications.map(({ userId }) => userId))];
  const allSubscriptions = await db.pushSubscription.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, userId: true, fid: true },
  }) as SubscriptionRecord[];
  const subscriptions = allSubscriptions.filter(({ fid }) => isValidFcmToken(fid));
  const malformedIds = allSubscriptions.filter(({ fid }) => !isValidFcmToken(fid)).map(({ id }) => id);
  if (malformedIds.length) {
    await db.pushSubscription.deleteMany({ where: { id: { in: malformedIds } } });
  }
  if (!subscriptions.length) return;

  const subscribedUsers = new Set(subscriptions.map(({ userId }) => userId));
  const deliverable = notifications.filter(({ userId }) => subscribedUsers.has(userId));
  if (!deliverable.length) return;

  // Initialize Firebase before writing delivery records. A configuration error
  // must not leave an undeliverable PENDING row that blocks later attempts.
  const { firebaseAdminMessaging } = await import("@/lib/firebase-admin");

  await db.notificationDelivery.createMany({
    data: deliverable.map(({ id }) => ({ notificationId: id, channel: "PUSH" as const, status: "PENDING" as const })),
    skipDuplicates: true,
  });

  const deliveries = await db.notificationDelivery.findMany({
    where: {
      notificationId: { in: deliverable.map(({ id }) => id) },
      channel: "PUSH",
      status: "PENDING",
      attemptedAt: null,
    },
    include: {
      notification: {
        select: { id: true, userId: true, type: true, title: true, body: true, data: true },
      },
    },
  });
  if (!deliveries.length) return;

  const subscriptionsByUser = new Map<string, SubscriptionRecord[]>();
  for (const subscription of subscriptions) {
    const current = subscriptionsByUser.get(subscription.userId) ?? [];
    current.push(subscription);
    subscriptionsByUser.set(subscription.userId, current);
  }

  await Promise.all(deliveries.map(async (delivery) => {
    const claimTime = new Date();
    const claim = await db.notificationDelivery.updateMany({
      where: { id: delivery.id, status: "PENDING", attemptedAt: null },
      data: { attemptedAt: claimTime },
    });
    if (claim.count !== 1) return;

    const targets = subscriptionsByUser.get(delivery.notification.userId) ?? [];
    const data = firebaseData(delivery.notification);
    const results = await Promise.allSettled(targets.map(async ({ fid }) => {
      const messageId = await sendWithTransientRetry(() => firebaseAdminMessaging.send({
        token: fid,
        notification: {
          title: delivery.notification.title,
          body: delivery.notification.body,
        },
        data,
        webpush: { headers: { Urgency: "high" } },
      }));
      return { fid, messageId };
    }));

    const successful = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const invalidTokens = results.flatMap((result, index) => {
      if (result.status !== "rejected") return [];
      const code = errorCode(result.reason);
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
        return [targets[index].fid];
      }
      console.error(`[push] Delivery failed for notification ${delivery.notificationId}: ${getSafePushError(result.reason).summary}`);
      return [];
    });

    if (invalidTokens.length) {
      await db.pushSubscription.deleteMany({ where: { fid: { in: invalidTokens } } });
    }

    if (successful.length) {
      const otherFailures = results.length - successful.length;
      await db.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerReference: successful[0].messageId,
          failureReason: otherFailures ? `${otherFailures} device send(s) failed; invalid registrations were removed where applicable.` : null,
        },
      });
      return;
    }

    const failureSummary = [...new Set(results
      .filter((result) => result.status === "rejected")
      .map((result) => result.status === "rejected" ? getSafePushError(result.reason).summary : "")
      .filter(Boolean))]
      .join("; ")
      .slice(0, 1000) || "No valid push subscriptions were available.";
    await db.notificationDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", failureReason: failureSummary },
    });
  }));
}

export async function dispatchPushForNotification(db: PrismaClient, notificationId: string) {
  const notifications = await getUndeliveredNotifications(db, { id: { in: [notificationId] } });
  await processNotifications(db, notifications);
}

export async function dispatchPushForRecentNotifications(
  db: PrismaClient,
  userIds: string[],
  notBefore: Date,
) {
  if (!userIds.length) return;
  const notifications = await getUndeliveredNotifications(db, {
    userId: { in: userIds },
    createdAt: { gte: notBefore },
  });
  await processNotifications(db, notifications);
}
