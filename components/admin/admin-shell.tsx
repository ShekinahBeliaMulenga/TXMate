import { cookies } from "next/headers";
import type { ReactNode } from "react";
import type { AdminContext } from "@/lib/admin/guard";
import { ADMIN_NAV_COOKIE, navItemsFor } from "@/lib/admin/nav";
import { ADMIN_ROLE_LABEL } from "@/lib/admin/permissions";
import AdminFrame from "./admin-frame";

/**
 * Server side of the admin frame: decides which navigation entries this role may see and reads the
 * remembered sidebar state. The sidebar starts collapsed until the admin opens it once.
 */
export default async function AdminShell({ admin, badges, children }: { admin: Pick<AdminContext, "name" | "role">; badges: Record<string, number>; children: ReactNode }) {
  const saved = (await cookies()).get(ADMIN_NAV_COOKIE)?.value;
  return (
    <AdminFrame
      user={{ name: admin.name, roleLabel: ADMIN_ROLE_LABEL[admin.role] }}
      items={navItemsFor(admin.role)}
      badges={badges}
      initialCollapsed={saved !== "open"}
    >
      {children}
    </AdminFrame>
  );
}
