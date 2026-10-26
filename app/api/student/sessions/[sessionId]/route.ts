import { triggerSessionLifecycle } from "@/lib/session-lifecycle-trigger";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SESSION_SELECT, serializeSession } from "@/lib/session-lifecycle-serialize";
import {
  attachSessionsToGroups,
  confirmCompletion,
  disputeCompletion,
  roleOf,
  submitAttendance,
  type ActionResult,
} from "@/lib/session-lifecycle-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ sessionId: string }> };
const NO_STORE = { "Cache-Control": "no-store" };

async function currentUserId() {
  const authSession = await auth.api.getSession({ headers: await headers() });
  return authSession?.user?.id ?? null;
}

function respond(result: ActionResult) {
  // Someone just answered: send whatever prompt that unlocks (e.g. the Mate's) right away.
  if (result.ok && result.changed) triggerSessionLifecycle({ force: true });
  return result.ok
    ? NextResponse.json({ message: result.message, changed: result.changed }, { headers: NO_STORE })
    : NextResponse.json({ error: result.message }, { status: result.status, headers: NO_STORE });
}

/** One session, visible only to its student or Academic Mate. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: "You must be signed in to view this session." }, { status: 401 });
    const { sessionId } = await context.params;
    const record = await prisma.tutoringSession.findUnique({ where: { id: sessionId }, select: SESSION_SELECT });
    const role = record ? roleOf(record, userId) : null;
    if (!record) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    if (!role) return NextResponse.json({ error: "You are not a participant in this session." }, { status: 403 });
    let groupId = record.groupId;
    if (role === "ACADEMIC_MATE" && ["SCHEDULED", "IN_PROGRESS", "DISPUTED"].includes(record.status)) {
      const attached = await attachSessionsToGroups(prisma, [{
        id: record.id,
        offeringId: record.request.offeringId,
        scheduledStart: record.scheduledStart,
        scheduledEnd: record.scheduledEnd,
        groupId: record.groupId,
        group: record.group,
      }]);
      groupId = attached.get(record.id) ?? groupId;
    }
    return NextResponse.json({ session: { ...serializeSession(record, userId), groupId } }, { headers: NO_STORE });
  } catch (error) {
    console.error("GET /api/student/sessions/[sessionId] failed:", error);
    return NextResponse.json({ error: "Unable to load this session." }, { status: 500 });
  }
}

/**
 * Attendance and completion answers.
 *   { type: "ATTENDANCE", attended: boolean }
 *   { type: "COMPLETION", action: "CONFIRM" }
 *   { type: "COMPLETION", action: "DISPUTE", reason: string }
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    const { sessionId } = await context.params;
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Send a valid request." }, { status: 400 }); }
    const input = (body ?? {}) as Record<string, unknown>;

    if (input.type === "ATTENDANCE") {
      if (typeof input.attended !== "boolean") return NextResponse.json({ error: "Say whether the student attended." }, { status: 400 });
      return respond(await submitAttendance({ sessionId, userId, attended: input.attended }));
    }
    if (input.type === "COMPLETION" && input.action === "CONFIRM") {
      return respond(await confirmCompletion({ sessionId, userId }));
    }
    if (input.type === "COMPLETION" && input.action === "DISPUTE") {
      if (typeof input.reason !== "string") return NextResponse.json({ error: "Please describe the problem." }, { status: 400 });
      return respond(await disputeCompletion({ sessionId, userId, reason: input.reason }));
    }
    return NextResponse.json({ error: "Unknown request." }, { status: 400 });
  } catch (error) {
    console.error("POST /api/student/sessions/[sessionId] failed:", error);
    return NextResponse.json({ error: "Unable to save your response. Please try again." }, { status: 500 });
  }
}
