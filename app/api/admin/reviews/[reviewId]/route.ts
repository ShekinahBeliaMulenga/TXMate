import { authorizeAdmin } from "@/lib/admin/guard";
import { badRequest, field, readObject, respond, serverError } from "@/lib/admin/api-helpers";
import { setReviewHidden } from "@/lib/admin/moderation";

/** PATCH /api/admin/reviews/[reviewId]  { hidden: boolean, reason: string } */
export async function PATCH(request: Request, context: { params: Promise<{ reviewId: string }> }) {
  try {
    const result = await authorizeAdmin("reviews:moderate");
    if (!result.ok) return result.response;
    const { reviewId } = await context.params;
    if (!reviewId || reviewId.length > 100) return badRequest("Invalid review.");
    const body = await readObject(request);
    const reason = body ? field(body, "reason", 2000) : null;
    if (!body || typeof body.hidden !== "boolean" || reason === null) return badRequest("Say whether to hide or restore, and give a reason.");
    return respond(await setReviewHidden(result.admin, { reviewId, hidden: body.hidden, reason, context: result.context }));
  } catch (error) {
    return serverError("PATCH /api/admin/reviews/[reviewId]", error);
  }
}
