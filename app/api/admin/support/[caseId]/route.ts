import { authorizeAdmin } from "@/lib/admin/guard";
import { badRequest, field, readObject, respond, serverError } from "@/lib/admin/api-helpers";
import { updateCase, type CaseChange } from "@/lib/admin/support";

/** PATCH /api/admin/support/[caseId]  { status?, priority?, assign?: "me"|"none", resolution?, note? } */
export async function PATCH(request: Request, context: { params: Promise<{ caseId: string }> }) {
  try {
    const result = await authorizeAdmin("support:manage");
    if (!result.ok) return result.response;
    const { caseId } = await context.params;
    if (!caseId || caseId.length > 100) return badRequest("Invalid case.");
    const body = await readObject(request);
    if (!body) return badRequest("Request body must be a JSON object.");
    const change: CaseChange = {};
    for (const key of ["status", "priority", "resolution", "note"] as const) {
      if (body[key] === undefined) continue;
      const value = field(body, key, 10000);
      if (value === null) return badRequest(`${key} is invalid.`);
      change[key] = value;
    }
    if (body.assign !== undefined) {
      if (body.assign !== "me" && body.assign !== "none") return badRequest("assign must be me or none.");
      change.assign = body.assign;
    }
    if (Object.keys(change).length === 0) return badRequest("Nothing to change.");
    return respond(await updateCase(result.admin, { caseId, change, context: result.context }));
  } catch (error) {
    return serverError("PATCH /api/admin/support/[caseId]", error);
  }
}
