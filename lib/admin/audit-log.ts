import { prisma } from "@/lib/prisma";
import type { AdminContext } from "./guard";
import { isPlatformWide } from "./permissions";
import { AUDIT_PAGE_SIZE, type AuditPage } from "./audit-types";

/**
 * Newest-first audit entries. Platform admins see everything; others see entries for their universities
 * only (entries with no university, such as sign-ins, are visible to platform admins only).
 */
export async function listAudit(admin: AdminContext, input: { action?: string | null; cursor?: string | null }): Promise<AuditPage> {
  const where = {
    ...(isPlatformWide(admin.scope) ? {} : { universityId: { in: [...admin.universityIds] } }),
    ...(input.action ? { action: input.action } : {}),
  };
  const rows = await prisma.adminAuditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: AUDIT_PAGE_SIZE + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: { id: true, actorName: true, actorRole: true, action: true, summary: true, createdAt: true },
  });
  const page = rows.slice(0, AUDIT_PAGE_SIZE);
  return {
    items: page.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    nextCursor: rows.length > AUDIT_PAGE_SIZE ? page[page.length - 1].id : null,
  };
}
