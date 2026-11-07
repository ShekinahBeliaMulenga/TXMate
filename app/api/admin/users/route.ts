import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/admin/guard";
import { listUsers } from "@/lib/admin/users";
import type { UserRoleFilter, UserStatusFilter } from "@/lib/admin/user-types";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/admin/users?q=&role=all|students|mates&status=all|suspended&from=YYYY-MM-DD&to=YYYY-MM-DD&cursor= */
export async function GET(request: Request) {
  try {
    const result = await authorizeAdmin("users:view");
    if (!result.ok) return result.response;

    const params = new URL(request.url).searchParams;
    const role = params.get("role");
    const status = params.get("status");
    const cursor = params.get("cursor");
    const page = await listUsers(result.admin, {
      q: params.get("q") ?? "",
      role: (role === "students" || role === "mates" ? role : "all") as UserRoleFilter,
      status: (status === "suspended" ? "suspended" : "all") as UserStatusFilter,
      from: (params.get("from") ?? "").slice(0, 10),
      to: (params.get("to") ?? "").slice(0, 10),
      cursor: cursor && cursor.length <= 100 ? cursor : null,
    });
    return NextResponse.json(page, { headers: NO_STORE });
  } catch (error) {
    console.error("GET /api/admin/users failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}
