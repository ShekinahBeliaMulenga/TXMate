import { describe, expect, test } from "bun:test";
import { CASE_CATEGORIES, CASE_PRIORITIES, CASE_STATUSES, needsResolution } from "../lib/admin/support-types";
import { navItemsFor } from "../lib/admin/nav";
import { roleHasPermission } from "../lib/admin/permissions";

describe("support cases", () => {
  test("only resolved and closed need a written outcome", () => {
    expect(CASE_STATUSES.filter(needsResolution)).toEqual(["RESOLVED", "CLOSED"]);
  });
  test("vocabulary matches the database enums", () => {
    expect([...CASE_PRIORITIES]).toEqual(["LOW", "NORMAL", "HIGH"]);
    expect([...CASE_CATEGORIES]).toEqual(["ACCOUNT", "TUTORING", "CONDUCT", "TECHNICAL", "OTHER"]);
  });
});

describe("round 5 navigation", () => {
  test("each role sees only what it may use", () => {
    const ids = (role: string) => navItemsFor(role).map((item) => item.id);
    expect(ids("SUPPORT")).toContain("support");
    expect(ids("SUPPORT")).not.toContain("reviews");
    expect(ids("MODERATOR")).toContain("reviews");
    expect(ids("MODERATOR")).not.toContain("health");
    expect(ids("PLATFORM_ADMIN")).toEqual(expect.arrayContaining(["analytics", "support", "reviews", "tutoring", "health", "structure"]));
    expect(roleHasPermission("MODERATOR", "messages:view")).toBe(false);
  });
});
