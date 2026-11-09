import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/admin/guard";
import { parseDirectoryQuery } from "@/lib/admin/directory-query";
import { listDirectory } from "@/lib/admin/ops";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/admin/tutoring?kind=requests|sessions&status=&arrangement=&q=&from=YYYY-MM-DD&to=YYYY-MM-DD&page= */
export async function GET(request: Request) {
  try {
    const result = await authorizeAdmin("tutoring:view");
    if (!result.ok) return result.response;
    const parsed = parseDirectoryQuery(new URL(request.url).searchParams);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE });
    return NextResponse.json(await listDirectory(result.admin, parsed.query), { headers: NO_STORE });
  } catch (error) {
    console.error("GET /api/admin/tutoring failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}
