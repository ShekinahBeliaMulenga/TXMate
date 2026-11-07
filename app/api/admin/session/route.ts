import { NextResponse } from "next/server";
import { authorizeAdminSignIn } from "@/lib/admin/guard";
import { recordAudit } from "@/lib/admin/audit";
import { prisma } from "@/lib/prisma";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/admin/session
 *
 * Called by the admin sign-in page right after Better Auth accepts the password. It confirms the
 * account really is an admin (the client then signs a non-admin back out), and writes the login to
 * the audit trail. Returns who is signed in and whether the two-step check (setup, verify) is still to do.
 * An admin session opens nothing else until that second step is done: the guard enforces it everywhere.
 */
export async function POST() {
  try {
    const result = await authorizeAdminSignIn();
    if (!result.ok) return result.response;

    // Login auditing is best effort: a logging problem must not lock every admin out.
    try {
      await recordAudit(prisma, {
        actor: result.admin,
        action: "ADMIN_LOGIN",
        targetType: "ADMIN_SESSION",
        targetId: result.admin.sessionId,
        summary: "Signed in to the admin portal",
        context: result.context,
      });
    } catch (error) {
      console.error("POST /api/admin/session: audit write failed:", error);
    }

    return NextResponse.json({ ok: true, role: result.admin.role, name: result.admin.name, twoStep: result.mode }, { headers: NO_STORE });
  } catch (error) {
    console.error("POST /api/admin/session failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}
