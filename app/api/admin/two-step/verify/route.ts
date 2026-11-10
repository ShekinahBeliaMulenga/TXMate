import { NextResponse } from "next/server";
import { field, NO_STORE, readObject } from "@/lib/admin/api-helpers";
import { authorizeAdminSignIn } from "@/lib/admin/guard";
import { verifySignIn } from "@/lib/admin/mfa";
import { twoStepError } from "@/lib/admin/two-step-api";
import { runExclusive } from "@/lib/run-exclusive";

/** POST /api/admin/two-step/verify { code }: the second step of signing in. An authenticator code or a backup code. */
export async function POST(request: Request) {
  try {
    const result = await authorizeAdminSignIn();
    if (!result.ok) return result.response;
    if (result.mode !== "verify") return NextResponse.json({ error: result.mode === "done" ? "You are already verified." : "Set up two-step sign-in first." }, { status: 409, headers: NO_STORE });
    const body = await readObject(request);
    const code = body ? field(body, "code", 40) : null;
    if (!code) return NextResponse.json({ error: "Enter your code." }, { status: 400, headers: NO_STORE });
    // One check at a time per admin, so parallel guesses cannot all pass the lock check before any is counted.
    const done = await runExclusive(`two-step:${result.admin.adminId}`, () => verifySignIn(result.admin, { code, context: result.context }));
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: NO_STORE });
    return NextResponse.json({ ok: true, usedBackupCode: done.usedBackupCode, backupCodesLeft: done.backupCodesLeft }, { headers: NO_STORE });
  } catch (error) {
    return twoStepError("POST /api/admin/two-step/verify", error);
  }
}
