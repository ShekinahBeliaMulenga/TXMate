import { triggerSessionLifecycle } from "@/lib/session-lifecycle-trigger";
import { expireStaleForUser } from "@/lib/arrangement-expiry";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { TutoringSessionWhereInput } from "@/generated/prisma/models/TutoringSession";
import { SESSION_SELECT, serializeSession } from "@/lib/session-lifecycle-serialize";
import { attachSessionsToGroups } from "@/lib/session-lifecycle-service";
import type { MateRequestWhereInput } from "@/generated/prisma/models/MateRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HISTORY_PAGE_SIZE = 40;
const OPEN_LIMIT = 250;
export async function GET(request: Request) {
  try {
    const authSession = await auth.api.getSession({ headers: await headers() });
    if (!authSession?.user) return NextResponse.json({ error: "You must be signed in to view sessions." }, { status: 401 });
    const userId = authSession.user.id;
    await expireStaleForUser(prisma, userId);
    triggerSessionLifecycle();
    const params = new URL(request.url).searchParams;
    const historyCursor = params.get("historyCursor");
    if (historyCursor && (historyCursor.length > 200 || historyCursor.trim() !== historyCursor)) {
      return NextResponse.json({ error: "Invalid history cursor." }, { status: 400 });
    }
    const participantFilter: MateRequestWhereInput = {
      OR: [
        { studentProfile: { userId } },
        { offering: { academicMateProfile: { userId } } },
      ],
    };
    const historyRequestFilter: MateRequestWhereInput = { ...participantFilter, status: { in: ["ACCEPTED", "CANCELLED"] } };
    const historyWhere: TutoringSessionWhereInput = {
      request: { is: historyRequestFilter },
      OR: [
        { status: { in: ["COMPLETED", "CANCELLED", "NO_SHOW"] } },
        { request: { is: { arrangementStatus: { in: ["CANCELLED", "EXPIRED"] } } } },
        { request: { is: { status: "CANCELLED" } } },
      ],
    };
    if (historyCursor) {
      const cursorExists = await prisma.tutoringSession.findFirst({ where: { ...historyWhere, id: historyCursor }, select: { id: true } });
      if (!cursorExists) return NextResponse.json({ error: "Invalid history cursor." }, { status: 400 });
    }
    const [openRecords, historyRecords, historyCount] = await Promise.all([
      prisma.tutoringSession.findMany({
        where: {
          status: { in: ["SCHEDULED", "IN_PROGRESS", "DISPUTED"] },
          request: { is: { ...participantFilter, status: "ACCEPTED", arrangementStatus: { in: ["ACTIVE", "PAUSED"] } } },
        },
        orderBy: [{ scheduledStart: "asc" }, { id: "asc" }],
        take: OPEN_LIMIT + 1,
        select: SESSION_SELECT,
      }),
      prisma.tutoringSession.findMany({
        where: historyWhere,
        orderBy: [{ scheduledStart: "desc" }, { id: "desc" }],
        take: HISTORY_PAGE_SIZE + 1,
        ...(historyCursor ? { cursor: { id: historyCursor }, skip: 1 } : {}),
        select: SESSION_SELECT,
      }),
      prisma.tutoringSession.count({ where: historyWhere }),
    ]);
    const historyHasMore = historyRecords.length > HISTORY_PAGE_SIZE;
    const historyPage = historyRecords.slice(0, HISTORY_PAGE_SIZE);
    const openPage = openRecords.slice(0, OPEN_LIMIT);
    // Bundle this Academic Mate's open sessions into groups (idempotent) so one sheet covers a slot.
    let groupIds = new Map<string, string>();
    try {
      groupIds = await attachSessionsToGroups(prisma, openPage
        .filter((record) => record.request.offering.academicMateProfile.userId === userId)
        .map((record) => ({ id: record.id, offeringId: record.request.offeringId, scheduledStart: record.scheduledStart, scheduledEnd: record.scheduledEnd, groupId: record.groupId, group: record.group })));
    } catch (error) {
      console.error("Grouping sessions failed (list still served):", error);
    }
    const sessions = new Map<string, ReturnType<typeof serializeSession>>();
    for (const record of [...openPage, ...historyPage]) {
      const item = serializeSession(record, userId);
      sessions.set(record.id, { ...item, groupId: groupIds.get(record.id) ?? item.groupId });
    }
    return NextResponse.json({
      sessions: [...sessions.values()],
      openLimitReached: openRecords.length > OPEN_LIMIT,
      historyCount,
      hasMoreHistory: historyHasMore,
      nextHistoryCursor: historyHasMore ? historyPage[historyPage.length - 1]?.id ?? null : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/student/sessions failed:", error);
    return NextResponse.json({ error: "Unable to load your sessions." }, { status: 500 });
  }
}
