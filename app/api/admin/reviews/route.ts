import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/admin/guard";
import { NO_STORE, serverError } from "@/lib/admin/api-helpers";
import { listReviews } from "@/lib/admin/moderation";

/** GET /api/admin/reviews?q=&state=all|visible|hidden&from=YYYY-MM-DD&to=YYYY-MM-DD&page= */
export async function GET(request: Request) {
  try {
    const result = await authorizeAdmin("reviews:moderate");
    if (!result.ok) return result.response;
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await listReviews(result.admin, { q: params.get("q") ?? "", state: (params.get("state") ?? "all").slice(0, 10), from: (params.get("from") ?? "").slice(0, 10), to: (params.get("to") ?? "").slice(0, 10), page: Number.parseInt(params.get("page") ?? "1", 10) || 1 }), { headers: NO_STORE });
  } catch (error) {
    return serverError("GET /api/admin/reviews", error);
  }
}
