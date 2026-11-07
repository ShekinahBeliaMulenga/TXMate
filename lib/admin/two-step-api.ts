import { NextResponse } from "next/server";
import { MfaConfigError } from "./mfa-crypto";
import { NO_STORE } from "./api-helpers";

/** Turns a thrown error from a two-step route into a response. A missing key closes the portal rather than skipping the step. */
export function twoStepError(label: string, error: unknown) {
  if (error instanceof MfaConfigError) {
    console.error(`${label}: ${error.message}`);
    return NextResponse.json({ error: "Two-step sign-in is not configured on the server. Ask whoever runs TXMate to set ADMIN_MFA_ENCRYPTION_KEY." }, { status: 503, headers: NO_STORE });
  }
  console.error(`${label} failed:`, error);
  return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
}
