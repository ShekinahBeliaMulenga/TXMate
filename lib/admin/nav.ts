import type { IconName } from "@/components/ui/icon";
import { roleHasPermission, type AdminPermission } from "./permissions";

/** Cookie remembering whether the sidebar is open. Read on the server so the first paint is already right. */
export const ADMIN_NAV_COOKIE = "txmate_admin_nav";

export type AdminNavGroup = "Overview" | "Review" | "People" | "Platform" | "Security" | "Tools";

export type AdminNavItem = {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  group: AdminNavGroup;
  permission: AdminPermission;
};

/** Every admin destination. Add one entry here and it appears in the sidebar for roles that may open it. */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/admin", icon: "dashboard", group: "Overview", permission: "dashboard:view" },
  { id: "analytics", label: "Analytics", href: "/admin/analytics", icon: "list", group: "Overview", permission: "analytics:view" },
  { id: "verification", label: "Verification", href: "/admin/academic-mates", icon: "shield", group: "Review", permission: "verification:review" },
  { id: "disputes", label: "Session reviews", href: "/admin/disputes", icon: "alert", group: "Review", permission: "disputes:view" },
  { id: "support", label: "Support cases", href: "/admin/support", icon: "inbox", group: "Review", permission: "support:manage" },
  { id: "reviews", label: "Reviews", href: "/admin/reviews", icon: "star", group: "Review", permission: "reviews:moderate" },
  { id: "tutoring", label: "Tutoring", href: "/admin/tutoring", icon: "calendar", group: "Review", permission: "tutoring:view" },
  { id: "users", label: "Users", href: "/admin/users", icon: "users", group: "People", permission: "users:view" },
  { id: "universities", label: "Universities", href: "/admin/universities", icon: "university", group: "Platform", permission: "universities:manage" },
  { id: "structure", label: "Academic structure", href: "/admin/structure", icon: "book", group: "Platform", permission: "universities:manage" },
  { id: "admins", label: "Admins", href: "/admin/admins", icon: "key", group: "Platform", permission: "admins:manage" },
  { id: "health", label: "System health", href: "/admin/health", icon: "info", group: "Security", permission: "system:view" },
  { id: "audit", label: "Audit log", href: "/admin/audit", icon: "audit", group: "Security", permission: "audit:view" },
  { id: "console", label: "Console", href: "/admin/console", icon: "terminal", group: "Tools", permission: "dashboard:view" },
];

export function navItemsFor(role: string): AdminNavItem[] {
  return ADMIN_NAV.filter((item) => roleHasPermission(role, item.permission));
}

/** The dashboard only matches exactly; every other item also matches its sub-pages. */
export function isNavActive(item: Pick<AdminNavItem, "href">, pathname: string): boolean {
  if (item.href === "/admin") return pathname === "/admin";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function currentNavItem<T extends Pick<AdminNavItem, "href">>(items: readonly T[], pathname: string): T | null {
  return items.find((item) => isNavActive(item, pathname)) ?? null;
}

/** Items grouped in display order, keeping the order they were declared in. */
export function groupNavItems<T extends Pick<AdminNavItem, "group">>(items: readonly T[]): Array<{ group: AdminNavGroup; items: T[] }> {
  const groups: Array<{ group: AdminNavGroup; items: T[] }> = [];
  for (const item of items) {
    const existing = groups.find((entry) => entry.group === item.group);
    if (existing) existing.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  return groups;
}
