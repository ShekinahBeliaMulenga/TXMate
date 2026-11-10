import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runScheduledJobs } from "@/lib/scheduled-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Compares the Authorization header with the secret in constant time (both are hashed first so their lengths match). */
function hasValidSecret(authorization: string | null, secret: string): boolean {
  const given = createHash("sha256").update(authorization ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error("CRON_SECRET is not configured.");
    return NextResponse.json(
      { error: "Scheduler is not configured." },
      { status: 503 },
    );
  }

  if (!hasValidSecret(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    return NextResponse.json(await runScheduledJobs(new Date()));
  } catch {
    // The reasons are already logged; a retry is safe because each action is claimed in the database.
    return NextResponse.json({ error: "Unable to process session reminders." }, { status: 500 });
  }
}
