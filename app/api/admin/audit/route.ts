import { NextResponse } from "next/server";
import { AUDIT_ACTIONS } from "@/lib/admin/audit";
import { listAudit } from "@/lib/admin/audit-log";
import { authorizeAdmin } from "@/lib/admin/guard";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/admin/audit?action=&cursor= */
export async function GET(request: Request) {
  try {
    const result = await authorizeAdmin("audit:view");
    if (!result.ok) return result.response;
    const params = new URL(request.url).searchParams;
    const action = params.get("action");
    const cursor = params.get("cursor");
    const page = await listAudit(result.admin, {
      action: action && (AUDIT_ACTIONS as readonly string[]).includes(action) ? action : null,
      actor: (params.get("actor") ?? "").slice(0, 100) || null,
      from: (params.get("from") ?? "").slice(0, 10),
      to: (params.get("to") ?? "").slice(0, 10),
      cursor: cursor && cursor.length <= 100 ? cursor : null,
    });
    return NextResponse.json(page, { headers: NO_STORE });
  } catch (error) {
    console.error("GET /api/admin/audit failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}
