import { triggerSessionLifecycle } from "@/lib/session-lifecycle-trigger";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeInternalUrl } from "@/lib/notify";
import { foldCategoryCounts } from "@/lib/notification-categories";
import { encodeCursor, notificationWhere, parseNotificationQuery } from "@/lib/notifications-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_IDS = 100;

function linkFor(type: string, data: unknown): string {
  const record = data !== null && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
  if (typeof record.url === "string") return safeInternalUrl(record.url);
  if (typeof record.sessionId === "string") return `/student/sessions?session=${encodeURIComponent(record.sessionId)}`;
  if (type === "NEW_MESSAGE") return "/student/messages";
  if (type === "MATE_REQUEST") return "/student/academic-mate/requests";
  return "/student/dashboard";
}

/** The signed-in user's in-app notifications, newest first, plus the unread count. */
export async function GET(request: Request) {
  try {
    const authSession = await auth.api.getSession({ headers: await headers() });
    const userId = authSession?.user?.id;
    if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    // Every open app polls this, which keeps prompts flowing without an external scheduler.
    triggerSessionLifecycle();
    const params = new URL(request.url).searchParams;
    const unreadCount = await prisma.notification.count({ where: { userId, readAt: null, deletedAt: null } });
    if (params.get("countOnly") === "1") return NextResponse.json({ unreadCount }, { headers: NO_STORE });

    const parsed = parseNotificationQuery(params);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE });
    const { query } = parsed;
    const rows = await prisma.notification.findMany({
      where: notificationWhere(userId, query),
      orderBy: query.order === "oldest" ? [{ createdAt: "asc" }, { id: "asc" }] : [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: { id: true, type: true, title: true, body: true, data: true, readAt: true, createdAt: true },
    });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    // How many notifications match the filters is only worked out for the first page.
    const matchCount = query.cursor ? null : await prisma.notification.count({ where: notificationWhere(userId, query, false) });
    const unreadByType = await prisma.notification.groupBy({ by: ["type"], where: { userId, readAt: null, deletedAt: null }, _count: { _all: true } });
    return NextResponse.json({
      unreadCount,
      categoryUnread: foldCategoryCounts(unreadByType.map((row) => ({ type: row.type, count: row._count._all }))),
      matchCount,
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.createdAt, last.id) : null,
      notifications: page.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        url: linkFor(row.type, row.data),
        read: row.readAt !== null,
        createdAt: row.createdAt.toISOString(),
      })),
    }, { headers: NO_STORE });
  } catch (error) {
    console.error("GET /api/student/notifications failed:", error);
    return NextResponse.json({ error: "Unable to load notifications." }, { status: 500 });
  }
}

/** { action: "READ", ids: string[] } or { action: "READ_ALL" }. Only the owner's rows are touched. */
export async function POST(request: Request) {
  try {
    const authSession = await auth.api.getSession({ headers: await headers() });
    const userId = authSession?.user?.id;
    if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Send a valid request." }, { status: 400 }); }
    const input = (body ?? {}) as Record<string, unknown>;
    const now = new Date();
    if (input.action === "READ_ALL") {
      await prisma.notification.updateMany({ where: { userId, readAt: null, deletedAt: null }, data: { readAt: now } });
    } else if (input.action === "READ" && Array.isArray(input.ids)) {
      const ids = input.ids.filter((id): id is string => typeof id === "string").slice(0, MAX_IDS);
      if (ids.length === 0) return NextResponse.json({ error: "Nothing to mark as read." }, { status: 400 });
      await prisma.notification.updateMany({ where: { userId, id: { in: ids }, readAt: null, deletedAt: null }, data: { readAt: now } });
    } else {
      return NextResponse.json({ error: "Unknown request." }, { status: 400 });
    }
    const unreadCount = await prisma.notification.count({ where: { userId, readAt: null, deletedAt: null } });
    return NextResponse.json({ unreadCount }, { headers: NO_STORE });
  } catch (error) {
    console.error("POST /api/student/notifications failed:", error);
    return NextResponse.json({ error: "Unable to update notifications." }, { status: 500 });
  }
}

/** { ids: string[] } hides those notifications, { all: true } hides every one. Deleting also marks them read. */
export async function DELETE(request: Request) {
  try {
    const authSession = await auth.api.getSession({ headers: await headers() });
    const userId = authSession?.user?.id;
    if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Send a valid request." }, { status: 400 }); }
    const input = (body ?? {}) as Record<string, unknown>;
    const now = new Date();
    if (input.all === true) {
      await prisma.notification.updateMany({ where: { userId, deletedAt: null }, data: { deletedAt: now, readAt: now } });
    } else if (Array.isArray(input.ids)) {
      const ids = input.ids.filter((id): id is string => typeof id === "string").slice(0, MAX_IDS);
      if (ids.length === 0) return NextResponse.json({ error: "Nothing to delete." }, { status: 400 });
      await prisma.notification.updateMany({ where: { userId, id: { in: ids }, deletedAt: null }, data: { deletedAt: now } });
      // A deleted notification should not keep counting as unread.
      await prisma.notification.updateMany({ where: { userId, id: { in: ids }, readAt: null }, data: { readAt: now } });
    } else {
      return NextResponse.json({ error: "Unknown request." }, { status: 400 });
    }
    const unreadCount = await prisma.notification.count({ where: { userId, readAt: null, deletedAt: null } });
    return NextResponse.json({ unreadCount }, { headers: NO_STORE });
  } catch (error) {
    console.error("DELETE /api/student/notifications failed:", error);
    return NextResponse.json({ error: "Unable to delete notifications." }, { status: 500 });
  }
}
