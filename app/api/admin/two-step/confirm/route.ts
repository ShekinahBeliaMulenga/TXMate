import { NextResponse } from "next/server";
import { field, NO_STORE, readObject } from "@/lib/admin/api-helpers";
import { authorizeAdminSignIn } from "@/lib/admin/guard";
import { confirmEnrollment } from "@/lib/admin/mfa";
import { twoStepError } from "@/lib/admin/two-step-api";
import { runExclusive } from "@/lib/run-exclusive";

/** POST /api/admin/two-step/confirm { code }: finishes setup and returns the backup codes (shown once). */
export async function POST(request: Request) {
  try {
    const result = await authorizeAdminSignIn();
    if (!result.ok) return result.response;
    if (result.mode !== "setup") return NextResponse.json({ error: "Two-step sign-in is already set up." }, { status: 409, headers: NO_STORE });
    const body = await readObject(request);
    const code = body ? field(body, "code", 40) : null;
    if (!code) return NextResponse.json({ error: "Enter the 6-digit code from your authenticator app." }, { status: 400, headers: NO_STORE });
    // Same lock as the sign-in check: setup codes are counted and locked the same way.
    const done = await runExclusive(`two-step:${result.admin.adminId}`, () => confirmEnrollment(result.admin, { code, context: result.context }));
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: NO_STORE });
    return NextResponse.json({ backupCodes: done.backupCodes }, { headers: NO_STORE });
  } catch (error) {
    return twoStepError("POST /api/admin/two-step/confirm", error);
  }
}
