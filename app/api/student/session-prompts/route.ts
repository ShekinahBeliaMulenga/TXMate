import { triggerSessionLifecycle } from "@/lib/session-lifecycle-trigger";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSessionPrompts } from "@/lib/session-prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sessions waiting on the signed-in user's answer. Polled by the in-app prompt. */
export async function GET() {
  try {
    const authSession = await auth.api.getSession({ headers: await headers() });
    const userId = authSession?.user?.id;
    if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    triggerSessionLifecycle();
    return NextResponse.json({ prompts: await getSessionPrompts(userId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/student/session-prompts failed:", error);
    return NextResponse.json({ error: "Unable to load prompts." }, { status: 500 });
  }
}
