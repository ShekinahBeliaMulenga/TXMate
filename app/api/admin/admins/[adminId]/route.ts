import { NextResponse } from "next/server";
import { revokeAdmin, updateAdmin } from "@/lib/admin/admins";
import { authorizeAdmin } from "@/lib/admin/guard";

const NO_STORE = { "Cache-Control": "no-store" };
const bad = (error: string) => NextResponse.json({ error }, { status: 400, headers: NO_STORE });

/** PATCH /api/admin/admins/[id]  { role, universityIds } */
export async function PATCH(request: Request, context: { params: Promise<{ adminId: string }> }) {
  try {
    const result = await authorizeAdmin("admins:manage");
    if (!result.ok) return result.response;
    const { adminId } = await context.params;
    if (!adminId || adminId.length > 100) return bad("Invalid admin.");
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)) return bad("Request body must be a JSON object.");
    const { role, universityIds } = body as Record<string, unknown>;
    if (typeof role !== "string") return bad("role is required.");
    if (!Array.isArray(universityIds) || !universityIds.every((id): id is string => typeof id === "string" && id.length <= 100)) return bad("universityIds must be a list of ids.");
    const updated = await updateAdmin(result.admin, { adminId, role, universityIds, context: result.context });
    if (!updated.ok) return NextResponse.json({ error: updated.error }, { status: updated.status, headers: NO_STORE });
    return NextResponse.json({ message: updated.message }, { headers: NO_STORE });
  } catch (error) {
    console.error("PATCH /api/admin/admins/[id] failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}

/** DELETE /api/admin/admins/[id] */
export async function DELETE(_request: Request, context: { params: Promise<{ adminId: string }> }) {
  try {
    const result = await authorizeAdmin("admins:manage");
    if (!result.ok) return result.response;
    const { adminId } = await context.params;
    if (!adminId || adminId.length > 100) return bad("Invalid admin.");
    const removed = await revokeAdmin(result.admin, { adminId, context: result.context });
    if (!removed.ok) return NextResponse.json({ error: removed.error }, { status: removed.status, headers: NO_STORE });
    return NextResponse.json({ message: removed.message }, { headers: NO_STORE });
  } catch (error) {
    console.error("DELETE /api/admin/admins/[id] failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}
