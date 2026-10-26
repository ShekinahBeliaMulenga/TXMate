import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/admin/guard";
import { resolveDispute } from "@/lib/admin/disputes";

const NO_STORE = { "Cache-Control": "no-store" };

/** POST /api/admin/disputes/[sessionId]/resolve  { outcome: "COMPLETED" | "NO_SHOW", note: string } */
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const result = await authorizeAdmin("disputes:resolve");
    if (!result.ok) return result.response;

    const { sessionId } = await context.params;
    if (!sessionId || sessionId.length > 100) {
      return NextResponse.json({ error: "Invalid session." }, { status: 400, headers: NO_STORE });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400, headers: NO_STORE });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400, headers: NO_STORE });
    }
    const { outcome, note } = body as Record<string, unknown>;
    if (outcome !== "COMPLETED" && outcome !== "NO_SHOW") {
      return NextResponse.json({ error: "outcome must be COMPLETED or NO_SHOW." }, { status: 400, headers: NO_STORE });
    }
    if (typeof note !== "string") {
      return NextResponse.json({ error: "A note explaining the decision is required." }, { status: 400, headers: NO_STORE });
    }

    const resolved = await resolveDispute(result.admin, { sessionId, outcome, note, context: result.context });
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status, headers: NO_STORE });
    return NextResponse.json({ message: resolved.message }, { headers: NO_STORE });
  } catch (error) {
    console.error("POST /api/admin/disputes/[sessionId]/resolve failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}
