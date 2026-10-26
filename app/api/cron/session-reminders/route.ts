import { NextResponse } from "next/server";
import { runScheduledJobs } from "@/lib/scheduled-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error("CRON_SECRET is not configured.");
    return NextResponse.json(
      { error: "Scheduler is not configured." },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    return NextResponse.json(await runScheduledJobs(new Date()));
  } catch {
    // The reasons are already logged; a retry is safe because each action is claimed in the database.
    return NextResponse.json({ error: "Unable to process session reminders." }, { status: 500 });
  }
}
