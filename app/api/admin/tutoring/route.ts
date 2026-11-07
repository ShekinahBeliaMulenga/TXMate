import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/admin/guard";
import { listDirectory } from "@/lib/admin/ops";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/admin/tutoring?kind=requests|sessions&status=&q=&from=YYYY-MM-DD&to=YYYY-MM-DD&page= */
export async function GET(request: Request) {
  try {
    const result = await authorizeAdmin("tutoring:view");
    if (!result.ok) return result.response;
    const params = new URL(request.url).searchParams;
    const page = await listDirectory(result.admin, {
      kind: params.get("kind") === "sessions" ? "sessions" : "requests",
      status: (params.get("status") ?? "all").slice(0, 30),
      q: params.get("q") ?? "",
      from: (params.get("from") ?? "").slice(0, 10),
      to: (params.get("to") ?? "").slice(0, 10),
      page: Number.parseInt(params.get("page") ?? "1", 10) || 1,
    });
    return NextResponse.json(page, { headers: NO_STORE });
  } catch (error) {
    console.error("GET /api/admin/tutoring failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}
