import { describe, expect, test } from "bun:test";
import { ADMIN_NAV, currentNavItem, groupNavItems, isNavActive, navItemsFor } from "../lib/admin/nav";
import { roleHasPermission } from "../lib/admin/permissions";

describe("admin navigation", () => {
  test("every role only sees destinations it may open", () => {
    for (const role of ["PLATFORM_ADMIN", "UNIVERSITY_ADMIN", "MODERATOR", "SUPPORT"]) {
      for (const item of navItemsFor(role)) expect(roleHasPermission(role, item.permission)).toBe(true);
    }
  });

  test("support cannot see verification or the audit log; platform admin sees all", () => {
    const support = navItemsFor("SUPPORT").map((item) => item.id);
    expect(support).toContain("disputes");
    expect(support).not.toContain("verification");
    expect(support).not.toContain("audit");
    expect(support).not.toContain("admins");
    expect(navItemsFor("UNIVERSITY_ADMIN").map((item) => item.id)).not.toContain("universities");
    expect(navItemsFor("PLATFORM_ADMIN")).toHaveLength(ADMIN_NAV.length);
    expect(navItemsFor("not-a-role")).toHaveLength(0);
  });

  test("dashboard matches only exactly; others match sub-pages", () => {
    const dashboard = ADMIN_NAV.find((item) => item.id === "dashboard")!;
    const users = ADMIN_NAV.find((item) => item.id === "users")!;
    expect(isNavActive(dashboard, "/admin")).toBe(true);
    expect(isNavActive(dashboard, "/admin/users")).toBe(false);
    expect(isNavActive(users, "/admin/users/abc")).toBe(true);
    expect(isNavActive(users, "/admin/usersx")).toBe(false);
  });

  test("currentNavItem and grouping keep declared order", () => {
    const items = navItemsFor("PLATFORM_ADMIN");
    expect(currentNavItem(items, "/admin/academic-mates/42")?.id).toBe("verification");
    expect(currentNavItem(items, "/elsewhere")).toBeNull();
    expect(groupNavItems(items).map((entry) => entry.group)).toEqual(["Overview", "Review", "People", "Platform", "Security", "Tools"]);
  });

  test("ids and hrefs are unique", () => {
    expect(new Set(ADMIN_NAV.map((item) => item.id)).size).toBe(ADMIN_NAV.length);
    expect(new Set(ADMIN_NAV.map((item) => item.href)).size).toBe(ADMIN_NAV.length);
  });
});
