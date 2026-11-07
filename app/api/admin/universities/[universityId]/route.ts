import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/admin/guard";
import { updateUniversity } from "@/lib/admin/universities";

const NO_STORE = { "Cache-Control": "no-store" };
const bad = (error: string) => NextResponse.json({ error }, { status: 400, headers: NO_STORE });

/** PATCH /api/admin/universities/[id]  { name?, status?, settings?: {...} } */
export async function PATCH(request: Request, context: { params: Promise<{ universityId: string }> }) {
  try {
    const result = await authorizeAdmin("universities:manage");
    if (!result.ok) return result.response;
    const { universityId } = await context.params;
    if (!universityId || universityId.length > 100) return bad("Invalid university.");
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)) return bad("Request body must be a JSON object.");
    const { name, status, settings } = body as Record<string, unknown>;
    if (settings !== undefined && (typeof settings !== "object" || settings === null || Array.isArray(settings))) return bad("settings must be an object.");
    const updated = await updateUniversity(result.admin, { id: universityId, name, status, settings: settings as Record<string, unknown> | undefined, context: result.context });
    if (!updated.ok) return NextResponse.json({ error: updated.error }, { status: updated.status, headers: NO_STORE });
    return NextResponse.json({ message: updated.message }, { headers: NO_STORE });
  } catch (error) {
    console.error("PATCH /api/admin/universities/[id] failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}
