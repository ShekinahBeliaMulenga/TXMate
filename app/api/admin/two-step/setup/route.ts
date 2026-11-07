import { NextResponse } from "next/server";
import { NO_STORE } from "@/lib/admin/api-helpers";
import { authorizeAdminSignIn } from "@/lib/admin/guard";
import { beginEnrollment } from "@/lib/admin/mfa";
import { twoStepError } from "@/lib/admin/two-step-api";

/** POST /api/admin/two-step/setup: creates the key to add to an authenticator app. Only before setup is finished. */
export async function POST() {
  try {
    const result = await authorizeAdminSignIn();
    if (!result.ok) return result.response;
    if (result.mode !== "setup") return NextResponse.json({ error: "Two-step sign-in is already set up." }, { status: 409, headers: NO_STORE });
    const started = await beginEnrollment(result.admin);
    if (!started.ok) return NextResponse.json({ error: started.error }, { status: started.status, headers: NO_STORE });
    return NextResponse.json({ secret: started.secret, uri: started.uri }, { headers: NO_STORE });
  } catch (error) {
    return twoStepError("POST /api/admin/two-step/setup", error);
  }
}
