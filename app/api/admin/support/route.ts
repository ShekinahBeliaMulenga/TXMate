import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/admin/guard";
import { badRequest, field, NO_STORE, readObject, respond, serverError } from "@/lib/admin/api-helpers";
import { createCase, listCases } from "@/lib/admin/support";

/** GET /api/admin/support?status=active|OPEN|...|all&q=&mine=1&from=YYYY-MM-DD&to=YYYY-MM-DD&page= */
export async function GET(request: Request) {
  try {
    const result = await authorizeAdmin("support:manage");
    if (!result.ok) return result.response;
    const params = new URL(request.url).searchParams;
    const page = await listCases(result.admin, { status: (params.get("status") ?? "active").slice(0, 20), q: params.get("q") ?? "", mine: params.get("mine") === "1", from: (params.get("from") ?? "").slice(0, 10), to: (params.get("to") ?? "").slice(0, 10), page: Number.parseInt(params.get("page") ?? "1", 10) || 1 });
    return NextResponse.json(page, { headers: NO_STORE });
  } catch (error) {
    return serverError("GET /api/admin/support", error);
  }
}

/** POST /api/admin/support  { title, description, category, priority, subjectEmail?, universityId? } */
export async function POST(request: Request) {
  try {
    const result = await authorizeAdmin("support:manage");
    if (!result.ok) return result.response;
    const body = await readObject(request);
    if (!body) return badRequest("Request body must be a JSON object.");
    const title = field(body, "title", 300);
    const description = field(body, "description", 10000);
    const category = field(body, "category", 20);
    const priority = field(body, "priority", 20);
    if (title === null || description === null || category === null || priority === null) return badRequest("Some details are missing or invalid.");
    return respond(await createCase(result.admin, { title, description, category, priority, subjectEmail: field(body, "subjectEmail", 320) ?? "", universityId: field(body, "universityId", 100) ?? "", context: result.context }));
  } catch (error) {
    return serverError("POST /api/admin/support", error);
  }
}
