/**
 * Admin roles and permissions. Pure and framework-free so it can be unit tested and shared by
 * route handlers, server components and the UI (the UI only uses it to hide controls; the server
 * is always the authority).
 *
 * Least privilege: each role gets only the permissions its job needs. Add a permission here, then
 * grant it to roles explicitly, rather than checking role names in route handlers.
 */

export type AdminRoleName = "PLATFORM_ADMIN" | "UNIVERSITY_ADMIN" | "MODERATOR" | "SUPPORT";

export const ADMIN_PERMISSIONS = [
  "dashboard:view",
  "verification:review",
  "disputes:view",
  "disputes:resolve",
  "users:view",
  "users:suspend",
  "audit:view",
  "admins:manage",
  "universities:manage",
  "tutoring:view",
  "system:view",
  "support:manage",
  "reviews:moderate",
  "messages:view",
  "users:anonymise",
  "analytics:view",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<AdminRoleName, ReadonlySet<AdminPermission>> = {
  PLATFORM_ADMIN: new Set<AdminPermission>(ADMIN_PERMISSIONS),
  UNIVERSITY_ADMIN: new Set<AdminPermission>([
    "dashboard:view",
    "verification:review",
    "disputes:view",
    "disputes:resolve",
    "users:view",
    "users:suspend",
    "audit:view",
    "tutoring:view",
    "system:view",
    "support:manage",
    "reviews:moderate",
    "messages:view",
    "analytics:view",
  ]),
  MODERATOR: new Set<AdminPermission>([
    "dashboard:view",
    "verification:review",
    "disputes:view",
    "disputes:resolve",
    "users:view",
    "tutoring:view",
    "support:manage",
    "reviews:moderate",
    "analytics:view",
  ]),
  SUPPORT: new Set<AdminPermission>(["dashboard:view", "disputes:view", "users:view", "tutoring:view", "support:manage"]),
};

export const ADMIN_ROLE_LABEL: Record<AdminRoleName, string> = {
  PLATFORM_ADMIN: "Platform admin",
  UNIVERSITY_ADMIN: "University admin",
  MODERATOR: "Moderator",
  SUPPORT: "Support",
};

export function isAdminRole(value: unknown): value is AdminRoleName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, value);
}

export function roleHasPermission(role: string, permission: AdminPermission): boolean {
  return isAdminRole(role) && ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsForRole(role: string): AdminPermission[] {
  return isAdminRole(role) ? ADMIN_PERMISSIONS.filter((permission) => ROLE_PERMISSIONS[role].has(permission)) : [];
}

/** Minimal shape needed for scope decisions. */
export interface AdminScope {
  role: string;
  universityIds: readonly string[];
}

/** Platform admins see every university; everyone else only the universities they were granted. */
export function isPlatformWide(scope: AdminScope): boolean {
  return scope.role === "PLATFORM_ADMIN";
}

export function canAccessUniversity(scope: AdminScope, universityId: string): boolean {
  return isPlatformWide(scope) || scope.universityIds.includes(universityId);
}

/**
 * Prisma `where` fragment restricting a `universityId` column to the admin's scope. Returns `{}`
 * for platform admins and an `in` filter otherwise (an empty grant list matches nothing, which is
 * the safe default for a non-platform admin with no university access).
 */
export function universityScopeFilter(scope: AdminScope): { universityId?: { in: string[] } } {
  return isPlatformWide(scope) ? {} : { universityId: { in: [...scope.universityIds] } };
}
