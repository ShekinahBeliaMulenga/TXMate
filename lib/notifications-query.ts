import type { NotificationWhereInput } from "@/generated/prisma/models/Notification";
import { dayRangeFilter } from "@/lib/admin/date-range";
import { NOTIFICATION_CATEGORIES, isNotificationCategory, type NotificationCategory } from "@/lib/notification-categories";

/**
 * Filtering and paging for the student notifications list. Kept free of database and request code so the rules
 * can be tested on their own. The caller always adds the signed-in user's id, so a filter can never reach
 * another person's notifications.
 */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
export const MAX_SEARCH_LENGTH = 100;

export { NOTIFICATION_CATEGORIES, isNotificationCategory, type NotificationCategory };

export type NotificationQuery = {
  limit: number;
  search: string;
  category: NotificationCategory | null;
  unreadOnly: boolean;
  /** Which end of the list comes first. */
  order: "newest" | "oldest";
  createdAt: { gte?: Date; lt?: Date } | undefined;
  cursor: { createdAt: Date; id: string } | null;
};

export type ParseResult = { ok: true; query: NotificationQuery } | { ok: false; error: string };

/** A position in the newest-first list: the time and id of the last row already sent. */
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify([createdAt.toISOString(), id]), "utf8").toString("base64url");
}

export function decodeCursor(value: string): { createdAt: Date; id: string } | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [time, id] = parsed;
    if (typeof time !== "string" || typeof id !== "string" || id.length === 0 || id.length > 100) return null;
    const createdAt = new Date(time);
    return Number.isFinite(createdAt.getTime()) ? { createdAt, id } : null;
  } catch {
    return null;
  }
}

export function parseNotificationQuery(params: URLSearchParams): ParseResult {
  const limit = Math.min(Math.max(Number.parseInt(params.get("limit") ?? "", 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const search = (params.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_LENGTH);

  const rawCategory = (params.get("type") ?? "").trim();
  let category: NotificationCategory | null = null;
  if (rawCategory !== "" && rawCategory !== "all") {
    if (!isNotificationCategory(rawCategory)) return { ok: false, error: "Choose a notification type from the list." };
    category = rawCategory;
  }

  const rawCursor = params.get("cursor");
  let cursor: NotificationQuery["cursor"] = null;
  if (rawCursor) {
    cursor = decodeCursor(rawCursor);
    if (!cursor) return { ok: false, error: "That page is no longer valid. Reload the list." };
  }

  return {
    ok: true,
    query: {
      limit,
      search,
      category,
      unreadOnly: params.get("unread") === "1",
      order: params.get("order") === "oldest" ? "oldest" : "newest",
      createdAt: dayRangeFilter(params.get("from"), params.get("to")),
      cursor,
    },
  };
}

/** The `where` for the list. Pass `withCursor: false` to count every match rather than the rest of the pages. */
export function notificationWhere(userId: string, query: NotificationQuery, withCursor = true): NotificationWhereInput {
  const and: NotificationWhereInput[] = [];
  if (query.search) {
    and.push({ OR: [
      { title: { contains: query.search, mode: "insensitive" as const } },
      { body: { contains: query.search, mode: "insensitive" as const } },
    ] });
  }
  if (withCursor && query.cursor) {
    const after = query.order === "oldest" ? "gt" : "lt";
    and.push({ OR: [
      { createdAt: { [after]: query.cursor.createdAt } },
      { createdAt: query.cursor.createdAt, id: { [after]: query.cursor.id } },
    ] });
  }
  return {
    userId,
    deletedAt: null,
    ...(query.unreadOnly ? { readAt: null } : {}),
    ...(query.category ? { type: { in: [...NOTIFICATION_CATEGORIES[query.category].types] } } : {}),
    ...(query.createdAt ? { createdAt: query.createdAt } : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}
