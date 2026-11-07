import { describe, expect, test } from "bun:test";
import { ADMIN_PERMISSIONS, canAccessUniversity, isAdminRole, permissionsForRole, roleHasPermission, universityScopeFilter } from "../lib/admin/permissions";
import { requestContextFrom } from "../lib/admin/request-context";
import { ADMIN_SESSION_MAX_AGE_MS, isAdminSessionExpired } from "../lib/admin/session-policy";

describe("role permissions (least privilege)", () => {
  test("platform admin holds every permission", () => {
    for (const permission of ADMIN_PERMISSIONS) expect(roleHasPermission("PLATFORM_ADMIN", permission)).toBe(true);
  });
  test("only platform admins manage admins", () => {
    expect(roleHasPermission("PLATFORM_ADMIN", "admins:manage")).toBe(true);
    for (const role of ["UNIVERSITY_ADMIN", "MODERATOR", "SUPPORT"]) expect(roleHasPermission(role, "admins:manage")).toBe(false);
  });
  test("support is read only", () => {
    expect(permissionsForRole("SUPPORT")).toEqual(["dashboard:view", "disputes:view", "users:view", "tutoring:view", "support:manage"]);
    expect(roleHasPermission("SUPPORT", "disputes:resolve")).toBe(false);
    expect(roleHasPermission("SUPPORT", "verification:review")).toBe(false);
  });
  test("moderators review and resolve but cannot suspend or read the audit log", () => {
    expect(roleHasPermission("MODERATOR", "verification:review")).toBe(true);
    expect(roleHasPermission("MODERATOR", "disputes:resolve")).toBe(true);
    expect(roleHasPermission("MODERATOR", "users:suspend")).toBe(false);
    expect(roleHasPermission("MODERATOR", "audit:view")).toBe(false);
  });
  test("verification reviewers match the roles the old routes allowed", () => {
    expect(["PLATFORM_ADMIN", "UNIVERSITY_ADMIN", "MODERATOR", "SUPPORT"].filter((role) => roleHasPermission(role, "verification:review"))).toEqual(["PLATFORM_ADMIN", "UNIVERSITY_ADMIN", "MODERATOR"]);
  });
  test("sensitive powers are limited", () => {
    expect(["PLATFORM_ADMIN", "UNIVERSITY_ADMIN", "MODERATOR", "SUPPORT"].filter((role) => roleHasPermission(role, "users:anonymise"))).toEqual(["PLATFORM_ADMIN"]);
    expect(["PLATFORM_ADMIN", "UNIVERSITY_ADMIN", "MODERATOR", "SUPPORT"].filter((role) => roleHasPermission(role, "messages:view"))).toEqual(["PLATFORM_ADMIN", "UNIVERSITY_ADMIN"]);
    expect(roleHasPermission("SUPPORT", "reviews:moderate")).toBe(false);
    expect(roleHasPermission("SUPPORT", "support:manage")).toBe(true);
  });
  test("unknown or missing roles get nothing (fail closed)", () => {
    expect(isAdminRole("STUDENT")).toBe(false);
    expect(isAdminRole("__proto__")).toBe(false);
    expect(isAdminRole("toString")).toBe(false);
    expect(roleHasPermission("STUDENT", "dashboard:view")).toBe(false);
    expect(permissionsForRole("")).toEqual([]);
  });
});

describe("university scope", () => {
  test("platform admins see everything", () => {
    const scope = { role: "PLATFORM_ADMIN", universityIds: [] };
    expect(canAccessUniversity(scope, "u1")).toBe(true);
    expect(universityScopeFilter(scope)).toEqual({});
  });
  test("others are limited to their universities", () => {
    const scope = { role: "UNIVERSITY_ADMIN", universityIds: ["u1", "u2"] };
    expect(canAccessUniversity(scope, "u1")).toBe(true);
    expect(canAccessUniversity(scope, "u3")).toBe(false);
    expect(universityScopeFilter(scope)).toEqual({ universityId: { in: ["u1", "u2"] } });
  });
  test("a non-platform admin with no grants matches nothing", () => {
    const scope = { role: "MODERATOR", universityIds: [] };
    expect(canAccessUniversity(scope, "u1")).toBe(false);
    expect(universityScopeFilter(scope)).toEqual({ universityId: { in: [] } });
  });
});

describe("admin session age", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  test("fresh sessions are valid, old ones expire", () => {
    expect(isAdminSessionExpired(new Date(now - 60_000), now)).toBe(false);
    expect(isAdminSessionExpired(new Date(now - ADMIN_SESSION_MAX_AGE_MS), now)).toBe(false);
    expect(isAdminSessionExpired(new Date(now - ADMIN_SESSION_MAX_AGE_MS - 1), now)).toBe(true);
  });
  test("an unreadable timestamp fails closed", () => {
    expect(isAdminSessionExpired("not a date", now)).toBe(true);
  });
});

describe("request context", () => {
  const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null });
  test("uses the first forwarded address", () => {
    expect(requestContextFrom(headers({ "x-forwarded-for": "41.0.0.1, 10.0.0.2", "user-agent": "Test/1.0" }))).toEqual({ ipAddress: "41.0.0.1", userAgent: "Test/1.0" });
  });
  test("falls back to x-real-ip and tolerates missing headers", () => {
    expect(requestContextFrom(headers({ "x-real-ip": "41.0.0.9" })).ipAddress).toBe("41.0.0.9");
    expect(requestContextFrom(headers({}))).toEqual({ ipAddress: null, userAgent: null });
  });
  test("strips control characters and caps length", () => {
    const result = requestContextFrom(headers({ "user-agent": `bad\nagent${"x".repeat(400)}` }));
    expect(result.userAgent?.includes("\n")).toBe(false);
    expect(result.userAgent?.length).toBe(300);
  });
});
