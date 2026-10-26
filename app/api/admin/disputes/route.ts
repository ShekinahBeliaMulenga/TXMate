import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/admin/guard";
import { listDisputes } from "@/lib/admin/disputes";
import type { DisputeListKind } from "@/lib/admin/dispute-types";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/admin/disputes?kind=open|resolved&cursor=<sessionId> */
export async function GET(request: Request) {
  try {
    const result = await authorizeAdmin("disputes:view");
    if (!result.ok) return result.response;

    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") ?? "open";
    if (kind !== "open" && kind !== "resolved") {
      return NextResponse.json({ error: "kind must be open or resolved." }, { status: 400, headers: NO_STORE });
    }
    const cursor = url.searchParams.get("cursor");
    if (cursor !== null && (cursor.length === 0 || cursor.length > 100)) {
      return NextResponse.json({ error: "Invalid cursor." }, { status: 400, headers: NO_STORE });
    }

    const page = await listDisputes(result.admin, kind as DisputeListKind, cursor);
    return NextResponse.json(page, { headers: NO_STORE });
  } catch (error) {
    console.error("GET /api/admin/disputes failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}
