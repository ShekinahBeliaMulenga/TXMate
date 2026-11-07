import { NextResponse } from "next/server";

export const NO_STORE = { "Cache-Control": "no-store" };

export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400, headers: NO_STORE });
export const serverError = (label: string, error: unknown) => {
  console.error(`${label} failed:`, error);
  return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500, headers: NO_STORE });
};

/** Reads a JSON object body, or null when it is missing, malformed or not an object. */
export async function readObject(request: Request): Promise<Record<string, unknown> | null> {
  const body: unknown = await request.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/** A string field within a length limit, or null. */
export function field(body: Record<string, unknown>, key: string, max: number): string | null {
  const value = body[key];
  return typeof value === "string" && value.length <= max ? value : null;
}

/** Turns a lib result ({ ok: true, message } or { ok: false, status, error }) into a response. */
export function respond(outcome: { ok: true; message?: string } | { ok: false; status: number; error: string }) {
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status, headers: NO_STORE });
  return NextResponse.json({ message: outcome.message ?? "Saved." }, { headers: NO_STORE });
}
