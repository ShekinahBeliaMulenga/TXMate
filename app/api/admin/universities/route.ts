import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/admin/guard";
import { createUniversity, listUniversities } from "@/lib/admin/universities";

const NO_STORE = { "Cache-Control": "no-store" };
const bad = (error: string) => NextResponse.json({ error }, { status: 400, headers: NO_STORE });

export async function GET() {
  try {
    const result = await authorizeAdmin("universities:manage");
    if (!result.ok) return result.response;
    return NextResponse.json({ items: await listUniversities() }, { headers: NO_STORE });
  } catch (error) {
    console.error("GET /api/admin/universities failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}

/** POST /api/admin/universities  { name, code } */
export async function POST(request: Request) {
  try {
    const result = await authorizeAdmin("universities:manage");
    if (!result.ok) return result.response;
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)) return bad("Request body must be a JSON object.");
    const { name, code } = body as Record<string, unknown>;
    if (typeof name !== "string" || typeof code !== "string") return bad("Name and code are required.");
    const created = await createUniversity(result.admin, { name, code, context: result.context });
    if (!created.ok) return NextResponse.json({ error: created.error }, { status: created.status, headers: NO_STORE });
    return NextResponse.json({ id: created.id, message: created.message }, { status: 201, headers: NO_STORE });
  } catch (error) {
    console.error("POST /api/admin/universities failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}
