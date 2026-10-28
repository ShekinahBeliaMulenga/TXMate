import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { answerVenueSuggestion, setSessionVenue, suggestSessionVenue, type ActionResult } from "@/lib/session-lifecycle-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ sessionId: string }> };
const NO_STORE = { "Cache-Control": "no-store" };

function respond(result: ActionResult) {
  return result.ok
    ? NextResponse.json({ message: result.message, changed: result.changed }, { headers: NO_STORE })
    : NextResponse.json({ error: result.message }, { status: result.status, headers: NO_STORE });
}

/**
 * The meeting place of one session.
 *   { action: "SET", location: string, alsoFuture?: boolean }   Academic Mate sets the venue
 *   { action: "SUGGEST", location: string }                      Student proposes a venue
 *   { action: "ACCEPT" } | { action: "DECLINE" }                 Academic Mate answers the suggestion
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const authSession = await auth.api.getSession({ headers: await headers() });
    const userId = authSession?.user?.id;
    if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

    const { sessionId } = await context.params;
    if (!sessionId?.trim() || sessionId.length > 100) return NextResponse.json({ error: "A valid session ID is required." }, { status: 400 });

    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Send a valid request." }, { status: 400 }); }
    const input = (typeof body === "object" && body !== null && !Array.isArray(body) ? body : {}) as Record<string, unknown>;

    const action = input.action;
    switch (action) {
      case "SET":
        if (input.alsoFuture !== undefined && typeof input.alsoFuture !== "boolean") return NextResponse.json({ error: "alsoFuture must be true or false." }, { status: 400 });
        return respond(await setSessionVenue({ sessionId, userId, location: input.location as string, alsoFuture: input.alsoFuture === true }));
      case "SUGGEST":
        return respond(await suggestSessionVenue({ sessionId, userId, location: input.location as string }));
      case "ACCEPT":
      case "DECLINE":
        return respond(await answerVenueSuggestion({ sessionId, userId, action }));
      default:
        return NextResponse.json({ error: "Unknown request." }, { status: 400 });
    }
  } catch (error) {
    console.error("POST /api/student/sessions/[sessionId]/venue failed:", error);
    return NextResponse.json({ error: "Unable to save the venue. Please try again." }, { status: 500 });
  }
}
