import { dayRangeFilter } from "./date-range";
import { prisma } from "@/lib/prisma";
import type { AdminContext } from "./guard";
import { isPlatformWide } from "./permissions";
import { AUDIT_PAGE_SIZE, type AuditPage } from "./audit-types";

/** Keeps only flat primitive facts from the stored JSON so the UI never renders unexpected shapes. */
function cleanDetails(value: unknown): Record<string, string | number | boolean | null> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean") out[key] = item;
  }
  return out;
}

/**
 * Newest-first audit entries. Platform admins see everything; others see entries for their universities
 * only (entries with no university, such as sign-ins, are visible to platform admins only).
 */
export async function listAudit(admin: AdminContext, input: { action?: string | null; actor?: string | null; from?: string; to?: string; cursor?: string | null }): Promise<AuditPage> {
  const when = dayRangeFilter(input.from, input.to);
  const where = {
    ...(when ? { createdAt: when } : {}),
    ...(isPlatformWide(admin.scope) ? {} : { universityId: { in: [...admin.universityIds] } }),
    ...(input.action ? { action: input.action } : {}),
    ...(input.actor ? { actorName: { contains: input.actor.slice(0, 100), mode: "insensitive" as const } } : {}),
  };
  const rows = await prisma.adminAuditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: AUDIT_PAGE_SIZE + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: { id: true, actorName: true, actorRole: true, action: true, summary: true, targetType: true, targetId: true, ipAddress: true, metadata: true, createdAt: true },
  });
  const page = rows.slice(0, AUDIT_PAGE_SIZE);
  return {
    items: page.map((row) => ({
      id: row.id,
      actorName: row.actorName,
      actorRole: row.actorRole,
      action: row.action,
      summary: row.summary,
      targetType: row.targetType,
      targetId: row.targetId,
      ipAddress: row.ipAddress,
      details: cleanDetails(row.metadata),
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: rows.length > AUDIT_PAGE_SIZE ? page[page.length - 1].id : null,
  };
}
