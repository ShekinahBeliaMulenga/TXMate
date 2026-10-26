import { triggerSessionLifecycle } from "@/lib/session-lifecycle-trigger";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { confirmGroupCompletion, getGroupSheet, submitGroupAttendance, type ActionResult } from "@/lib/session-lifecycle-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ groupId: string }> };
const NO_STORE = { "Cache-Control": "no-store" };
const MAX_ROWS = 500;

async function currentUserId() {
  const authSession = await auth.api.getSession({ headers: await headers() });
  return authSession?.user?.id ?? null;
}
function respond(result: ActionResult) {
  if (result.ok && result.changed) triggerSessionLifecycle({ force: true });
  return result.ok
    ? NextResponse.json({ message: result.message, changed: result.changed }, { headers: NO_STORE })
    : NextResponse.json({ error: result.message }, { status: result.status, headers: NO_STORE });
}

/** The group attendance sheet. Only the Academic Mate who runs the session can open it. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    const { groupId } = await context.params;
    const sheet = await getGroupSheet(groupId, userId);
    if (!sheet) return NextResponse.json({ error: "Attendance sheet not found." }, { status: 404 });
    return NextResponse.json({ sheet }, { headers: NO_STORE });
  } catch (error) {
    console.error("GET session group failed:", error);
    return NextResponse.json({ error: "Unable to load the attendance sheet." }, { status: 500 });
  }
}

/**
 *   { type: "ATTENDANCE", responses: [{ sessionId, attended }] }  one submit for the group
 *   { type: "COMPLETION" }                                         one confirmation for the group
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    const { groupId } = await context.params;
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Send a valid request." }, { status: 400 }); }
    const input = (body ?? {}) as Record<string, unknown>;

    if (input.type === "ATTENDANCE") {
      const raw = input.responses;
      if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ROWS) return NextResponse.json({ error: "Choose an answer for each student." }, { status: 400 });
      const responses: { sessionId: string; attended: boolean }[] = [];
      for (const item of raw) {
        const row = (item ?? {}) as Record<string, unknown>;
        if (typeof row.sessionId !== "string" || typeof row.attended !== "boolean") return NextResponse.json({ error: "Choose an answer for each student." }, { status: 400 });
        responses.push({ sessionId: row.sessionId, attended: row.attended });
      }
      return respond(await submitGroupAttendance({ groupId, userId, responses }));
    }
    if (input.type === "COMPLETION") return respond(await confirmGroupCompletion({ groupId, userId }));
    return NextResponse.json({ error: "Unknown request." }, { status: 400 });
  } catch (error) {
    console.error("POST session group failed:", error);
    return NextResponse.json({ error: "Unable to save. Please try again." }, { status: 500 });
  }
}
