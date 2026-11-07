import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/admin/guard";
import { badRequest, field, NO_STORE, readObject, respond, serverError } from "@/lib/admin/api-helpers";
import { setMessagingEnabled, viewConversation } from "@/lib/admin/moderation";

async function parse(request: Request, params: Promise<{ requestId: string }>) {
  const { requestId } = await params;
  const body = await readObject(request);
  const reason = body ? field(body, "reason", 2000) : null;
  if (!requestId || requestId.length > 100 || !body || reason === null) return null;
  return { requestId, body, reason };
}

/** POST /api/admin/conversations/[requestId]  { reason }  reads the conversation and records that it was read. */
export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    const result = await authorizeAdmin("messages:view");
    if (!result.ok) return result.response;
    const parsed = await parse(request, context.params);
    if (!parsed) return badRequest("Give a reason for reading this conversation.");
    const outcome = await viewConversation(result.admin, { requestId: parsed.requestId, reason: parsed.reason, context: result.context });
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status, headers: NO_STORE });
    return NextResponse.json(outcome, { headers: NO_STORE });
  } catch (error) {
    return serverError("POST /api/admin/conversations/[requestId]", error);
  }
}

/** PATCH /api/admin/conversations/[requestId]  { enabled: boolean, reason } */
export async function PATCH(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    const result = await authorizeAdmin("messages:view");
    if (!result.ok) return result.response;
    const parsed = await parse(request, context.params);
    if (!parsed || typeof parsed.body.enabled !== "boolean") return badRequest("Say whether messaging should be on or off, and give a reason.");
    return respond(await setMessagingEnabled(result.admin, { requestId: parsed.requestId, enabled: parsed.body.enabled, reason: parsed.reason, context: result.context }));
  } catch (error) {
    return serverError("PATCH /api/admin/conversations/[requestId]", error);
  }
}
