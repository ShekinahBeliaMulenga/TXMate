import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getReviewState, submitReview } from "@/lib/review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ sessionId: string }> };
const NO_STORE = { "Cache-Control": "no-store" };

async function currentUserId() {
  const authSession = await auth.api.getSession({ headers: await headers() });
  return authSession?.user?.id ?? null;
}

/** Whether the signed-in student can review this session, and the review they already left. */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    const { sessionId } = await context.params;
    const state = await getReviewState(userId, sessionId);
    if ("error" in state) return NextResponse.json({ error: state.error === "NOT_FOUND" ? "Session not found." : "You are not a participant in this session." }, { status: state.error === "NOT_FOUND" ? 404 : 403, headers: NO_STORE });
    return NextResponse.json(state, { headers: NO_STORE });
  } catch (error) {
    console.error("GET /api/student/sessions/[sessionId]/review failed:", error);
    return NextResponse.json({ error: "Unable to load your review." }, { status: 500 });
  }
}

/** { rating: 1-5, comment?: string }. Creates the review, or edits it while editing is open. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    const { sessionId } = await context.params;
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Send a valid request." }, { status: 400 }); }
    const input = (body ?? {}) as Record<string, unknown>;
    const result = await submitReview({ userId, sessionId, rating: input.rating, comment: input.comment });
    return result.ok
      ? NextResponse.json({ message: result.message, review: result.review }, { headers: NO_STORE })
      : NextResponse.json({ error: result.message }, { status: result.status, headers: NO_STORE });
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "P2002") return NextResponse.json({ error: "You've already reviewed this session." }, { status: 409 });
    console.error("POST /api/student/sessions/[sessionId]/review failed:", error);
    return NextResponse.json({ error: "Unable to save your review. Please try again." }, { status: 500 });
  }
}
