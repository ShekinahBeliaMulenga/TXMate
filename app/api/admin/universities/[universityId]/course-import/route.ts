import { NextResponse } from "next/server";
import { importCourses } from "@/lib/admin/course-import";
import { IMPORT_MAX_CHARS } from "@/lib/admin/academic-import-rules";
import { authorizeAdmin } from "@/lib/admin/guard";

const NO_STORE = { "Cache-Control": "no-store" };
const bad = (error: string) => NextResponse.json({ error }, { status: 400, headers: NO_STORE });

/** POST /api/admin/universities/[id]/course-import  { csv: string, dryRun?: boolean } */
export async function POST(request: Request, context: { params: Promise<{ universityId: string }> }) {
  try {
    const result = await authorizeAdmin("universities:manage");
    if (!result.ok) return result.response;
    const { universityId } = await context.params;
    if (!universityId || universityId.length > 100) return bad("Invalid university.");
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)) return bad("Request body must be a JSON object.");
    const { csv, dryRun } = body as Record<string, unknown>;
    if (typeof csv !== "string" || csv.length === 0 || csv.length > IMPORT_MAX_CHARS) return bad("Provide the CSV text (up to about 1 MB).");
    if (dryRun !== undefined && typeof dryRun !== "boolean") return bad("dryRun must be true or false.");

    const outcome = await importCourses(result.admin, { universityId, csv, dryRun: dryRun !== false, context: result.context });
    if (!outcome.ok) return NextResponse.json({ error: outcome.error, problems: outcome.problems ?? [] }, { status: outcome.status, headers: NO_STORE });
    return NextResponse.json(outcome, { headers: NO_STORE });
  } catch (error) {
    console.error("POST /api/admin/universities/[id]/course-import failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}
