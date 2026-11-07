import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/admin/guard";
import { createDepartment, updateProgramme } from "@/lib/admin/structure";

const NO_STORE = { "Cache-Control": "no-store" };
const bad = (error: string) => NextResponse.json({ error }, { status: 400, headers: NO_STORE });
const text = (value: unknown, max = 200) => (typeof value === "string" && value.length > 0 && value.length <= max ? value : null);

/**
 * PATCH /api/admin/structure  { programmeId, departmentId?, durationYears? }  sets a programme's department or length
 * POST  /api/admin/structure  { schoolId, code, name }                        adds a department to a school
 */
async function handle(request: Request, kind: "programme" | "department") {
  try {
    const result = await authorizeAdmin("universities:manage");
    if (!result.ok) return result.response;
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)) return bad("Request body must be a JSON object.");
    const input = body as Record<string, unknown>;

    const outcome =
      kind === "programme"
        ? await (async () => {
            const programmeId = text(input.programmeId, 100);
            if (!programmeId) return null;
            if (input.departmentId !== undefined && !text(input.departmentId, 100)) return null;
            if (input.durationYears !== undefined && typeof input.durationYears !== "number") return null;
            return updateProgramme(result.admin, {
              programmeId,
              departmentId: typeof input.departmentId === "string" ? input.departmentId : undefined,
              durationYears: typeof input.durationYears === "number" ? input.durationYears : undefined,
              context: result.context,
            });
          })()
        : await (async () => {
            const schoolId = text(input.schoolId, 100);
            const code = text(input.code, 40);
            const name = text(input.name, 300);
            if (!schoolId || !code || !name) return null;
            return createDepartment(result.admin, { schoolId, code, name, context: result.context });
          })();
    if (!outcome) return bad("Some details are missing or invalid.");
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status, headers: NO_STORE });
    return NextResponse.json({ message: outcome.message }, { headers: NO_STORE });
  } catch (error) {
    console.error("/api/admin/structure failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}

export const PATCH = (request: Request) => handle(request, "programme");
export const POST = (request: Request) => handle(request, "department");
