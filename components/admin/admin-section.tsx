import type { ReactNode } from "react";
import { requireAdminPage } from "@/lib/admin/guard";
import { getNavBadges } from "@/lib/admin/nav-badges";
import type { AdminPermission } from "@/lib/admin/permissions";
import AdminShell from "./admin-shell";

/**
 * Use as the body of a segment layout (or a page with no layout): it enforces the permission on the
 * server, then renders the admin frame around the section.
 *
 *   export default function Layout({ children }) {
 *     return <AdminSection permission="users:view">{children}</AdminSection>;
 *   }
 */
export default async function AdminSection({ permission, children }: { permission: AdminPermission; children: ReactNode }) {
  const admin = await requireAdminPage(permission);
  const badges = await getNavBadges(admin);
  return <AdminShell admin={admin} badges={badges}>{children}</AdminShell>;
}
