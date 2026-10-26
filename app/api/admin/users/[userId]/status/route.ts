import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/admin/guard";
import { changeAccountStatus } from "@/lib/admin/users";

const NO_STORE = { "Cache-Control": "no-store" };
const bad = (error: string) => NextResponse.json({ error }, { status: 400, headers: NO_STORE });

/** POST /api/admin/users/[userId]/status  { scope: "STUDENT" | "MATE", action: "SUSPEND" | "REACTIVATE", reason: string } */
export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const result = await authorizeAdmin("users:suspend");
    if (!result.ok) return result.response;

    const { userId } = await context.params;
    if (!userId || userId.length > 100) return bad("Invalid user.");

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return bad("Request body must be valid JSON.");
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) return bad("Request body must be a JSON object.");
    const { scope, action, reason } = body as Record<string, unknown>;
    if (scope !== "STUDENT" && scope !== "MATE") return bad("scope must be STUDENT or MATE.");
    if (action !== "SUSPEND" && action !== "REACTIVATE") return bad("action must be SUSPEND or REACTIVATE.");
    if (typeof reason !== "string") return bad("A reason is required.");

    const changed = await changeAccountStatus(result.admin, { userId, scope, action, reason, context: result.context });
    if (!changed.ok) return NextResponse.json({ error: changed.error }, { status: changed.status, headers: NO_STORE });
    return NextResponse.json({ message: changed.message }, { headers: NO_STORE });
  } catch (error) {
    console.error("POST /api/admin/users/[userId]/status failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}
