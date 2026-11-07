import { NextResponse } from "next/server";
import { NO_STORE } from "@/lib/admin/api-helpers";
import { authorizeAdminSignIn } from "@/lib/admin/guard";
import { twoStepError } from "@/lib/admin/two-step-api";

/** GET /api/admin/two-step: where this sign-in stands. mode is setup, verify or done. */
export async function GET() {
  try {
    const result = await authorizeAdminSignIn();
    if (!result.ok) return result.response;
    return NextResponse.json({ mode: result.mode }, { headers: NO_STORE });
  } catch (error) {
    return twoStepError("GET /api/admin/two-step", error);
  }
}
