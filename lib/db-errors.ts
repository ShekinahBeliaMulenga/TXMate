/**
 * For a Prisma unique-constraint error (P2002) returns the lower-cased constraint target
 * ("" when the driver adapter does not report one). Returns null for any other error.
 */
export function uniqueViolationTarget(error: unknown): string | null {
  const e = error as { code?: unknown; meta?: { target?: unknown } } | null;
  if (!e || typeof e !== "object" || e.code !== "P2002") return null;
  const t = e.meta?.target;
  return (Array.isArray(t) ? t.join(",") : typeof t === "string" ? t : "").toLowerCase();
}
