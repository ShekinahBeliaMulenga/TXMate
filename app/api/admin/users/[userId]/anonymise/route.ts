import { authorizeAdmin } from "@/lib/admin/guard";
import { badRequest, field, readObject, respond, serverError } from "@/lib/admin/api-helpers";
import { anonymiseUser } from "@/lib/admin/anonymise";

/** POST /api/admin/users/[userId]/anonymise  { confirmEmail, reason }  Irreversible. Platform admins only. */
export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const result = await authorizeAdmin("users:anonymise");
    if (!result.ok) return result.response;
    const { userId } = await context.params;
    const body = await readObject(request);
    const confirmEmail = body ? field(body, "confirmEmail", 320) : null;
    const reason = body ? field(body, "reason", 2000) : null;
    if (!userId || userId.length > 100 || confirmEmail === null || reason === null) return badRequest("Type the account’s email and give a reason.");
    return respond(await anonymiseUser(result.admin, { userId, confirmEmail, reason, context: result.context }));
  } catch (error) {
    return serverError("POST /api/admin/users/[userId]/anonymise", error);
  }
}
