import { prisma } from "@/lib/prisma";
import { countOpenDisputes } from "./disputes";
import type { AdminContext } from "./guard";
import { roleHasPermission, universityScopeFilter } from "./permissions";

/** Counts shown next to sidebar items, keyed by nav item id. Only items the role may open are counted. */
export async function getNavBadges(admin: AdminContext): Promise<Record<string, number>> {
  const [verification, disputes] = await Promise.all([
    roleHasPermission(admin.role, "verification:review")
      ? prisma.academicMateProfile.count({ where: { verificationStatus: "PENDING", ...universityScopeFilter(admin.scope) } })
      : 0,
    roleHasPermission(admin.role, "disputes:view") ? countOpenDisputes(admin) : 0,
  ]);
  return { verification, disputes };
}
