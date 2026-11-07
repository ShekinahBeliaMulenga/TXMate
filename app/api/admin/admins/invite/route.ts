import { NextResponse } from "next/server";
import { inviteAdmin } from "@/lib/admin/admins";
import { authorizeAdmin } from "@/lib/admin/guard";

const NO_STORE = { "Cache-Control": "no-store" };
const bad = (error: string) => NextResponse.json({ error }, { status: 400, headers: NO_STORE });

/** POST /api/admin/admins/invite  { name, email, role, universityIds } */
export async function POST(request: Request) {
  try {
    const result = await authorizeAdmin("admins:manage");
    if (!result.ok) return result.response;
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)) return bad("Request body must be a JSON object.");
    const { name, email, role, universityIds } = body as Record<string, unknown>;
    if (typeof name !== "string" || typeof email !== "string" || typeof role !== "string") return bad("Name, email and role are required.");
    if (!Array.isArray(universityIds) || !universityIds.every((id): id is string => typeof id === "string" && id.length <= 100)) return bad("universityIds must be a list of ids.");
    const invited = await inviteAdmin(result.admin, { name, email, role, universityIds, context: result.context });
    if (!invited.ok) return NextResponse.json({ error: invited.error }, { status: invited.status, headers: NO_STORE });
    return NextResponse.json({ message: invited.message }, { status: 201, headers: NO_STORE });
  } catch (error) {
    console.error("POST /api/admin/admins/invite failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}
