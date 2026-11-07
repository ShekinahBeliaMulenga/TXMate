import { NextResponse } from "next/server";
import { resendInvite } from "@/lib/admin/admins";
import { authorizeAdmin } from "@/lib/admin/guard";

const NO_STORE = { "Cache-Control": "no-store" };

/** POST /api/admin/admins/[id]/invite — send the invitation again. */
export async function POST(_request: Request, context: { params: Promise<{ adminId: string }> }) {
  try {
    const result = await authorizeAdmin("admins:manage");
    if (!result.ok) return result.response;
    const { adminId } = await context.params;
    if (!adminId || adminId.length > 100) return NextResponse.json({ error: "Invalid admin." }, { status: 400, headers: NO_STORE });
    const sent = await resendInvite(result.admin, { adminId, context: result.context });
    if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: sent.status, headers: NO_STORE });
    return NextResponse.json({ message: sent.message }, { headers: NO_STORE });
  } catch (error) {
    console.error("POST /api/admin/admins/[id]/invite failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}
