import { NextResponse } from "next/server";
import { CONSOLE_MAX_LINE } from "@/lib/admin/console-parse";
import { runConsoleCommand } from "@/lib/admin/console";
import { authorizeAdmin } from "@/lib/admin/guard";

const NO_STORE = { "Cache-Control": "no-store" };

/** POST /api/admin/console  { line: string, confirmToken?: string }  -> { lines, navigate?, confirm? } */
export async function POST(request: Request) {
  try {
    const result = await authorizeAdmin("dashboard:view");
    if (!result.ok) return result.response;
    const body: unknown = await request.json().catch(() => null);
    const line = typeof body === "object" && body !== null ? (body as { line?: unknown }).line : undefined;
    if (typeof line !== "string" || line.length > CONSOLE_MAX_LINE) return NextResponse.json({ error: "Invalid command." }, { status: 400, headers: NO_STORE });
    const token = (body as { confirmToken?: unknown }).confirmToken;
    if (token !== undefined && token !== null && (typeof token !== "string" || token.length > 300)) return NextResponse.json({ error: "Invalid confirmation." }, { status: 400, headers: NO_STORE });
    return NextResponse.json(await runConsoleCommand(result.admin, line, { confirmToken: typeof token === "string" ? token : null, context: result.context }), { headers: NO_STORE });
  } catch (error) {
    console.error("POST /api/admin/console failed:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
  }
}
