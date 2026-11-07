import { NextResponse } from "next/server";
import { resetTwoStep } from "@/lib/admin/admins";
import { authorizeAdmin } from "@/lib/admin/guard";

const NO_STORE = { "Cache-Control": "no-store" };

/** POST /api/admin/admins/[id]/two-step-reset: clears that admin's two-step sign-in so they set it up again. */
export async function POST(_request: Request, context: { params: Promise<{ adminId: string }> }) {
  try {
    const result = await authorizeAdmin("admins:manage");
    if (!result.ok) return result.response;
    const { adminId } = await context.params;
    if (!adminId || adminId.length > 100) return NextResponse.json({ error: "Invalid admin." }, { status: 400, headers: NO_STORE });
    const outcome = await resetTwoStep(result.admin, { adminId, context: result.context });
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status, headers: NO_STORE });
    return NextResponse.json({ message: outcome.message }, { headers: NO_STORE });
  } catch (error) {
    console.error("POST /api/admin/admins/[id]/two-step-reset failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}
