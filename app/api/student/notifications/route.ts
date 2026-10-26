import { triggerSessionLifecycle } from "@/lib/session-lifecycle-trigger";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeInternalUrl } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
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

    const limit = Math.min(Math.max(Number.parseInt(params.get("limit") ?? "", 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const rows = await prisma.notification.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: { id: true, type: true, title: true, body: true, data: true, readAt: true, createdAt: true },
    });
    return NextResponse.json({
      unreadCount,
      notifications: rows.map((row) => ({
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
