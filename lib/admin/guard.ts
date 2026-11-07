import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole, roleHasPermission, type AdminPermission, type AdminRoleName, type AdminScope } from "./permissions";
import { requestContextFrom, type RequestContext } from "./request-context";
import type { MfaMode } from "./mfa-policy";
import { isAdminSessionExpired } from "./session-policy";

/**
 * The single place that decides "is this request from an admin, and may they do X".
 * Every admin API route and every admin page goes through here, so a new route cannot forget a check
 * and the rules (roles, university scope, session age) change in one file.
 */

export type AdminContext = {
  adminId: string;
  userId: string;
  name: string;
  email: string;
  role: AdminRoleName;
  universityIds: string[];
  sessionId: string;
  scope: AdminScope;
};

export type AdminResolution =
  | { status: "anonymous" }
  | { status: "expired" }
  | { status: "not-admin" }
  /** Signed in as an admin with the right password, but the second step is still to do (or to set up). */
  | { status: "mfa"; mode: MfaMode; admin: AdminContext }
  | { status: "ok"; admin: AdminContext };

/** Looks up the signed-in user and their admin record. No redirects or responses: callers decide. */
export async function resolveAdmin(): Promise<AdminResolution> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id || !session.session) return { status: "anonymous" };

  const profile = await prisma.adminProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, role: true, universityAccess: { select: { universityId: true } }, twoFactor: { select: { confirmedAt: true } } },
  });
  if (!profile || !isAdminRole(profile.role)) return { status: "not-admin" };
  if (isAdminSessionExpired(session.session.createdAt)) return { status: "expired" };

  const universityIds = profile.universityAccess.map((access) => access.universityId);
  const admin: AdminContext = {
    adminId: profile.id,
    userId: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: profile.role,
    universityIds,
    sessionId: session.session.id,
    scope: { role: profile.role, universityIds },
  };

  // The password is not enough. Every admin session must have passed two-step verification, and an admin
  // who has not set it up yet is taken through setup before anything else opens. This is the one place
  // that decides it, so no admin page or route can forget the check.
  const enrolled = Boolean(profile.twoFactor?.confirmedAt);
  const verified = enrolled ? await prisma.adminSessionMfa.findUnique({ where: { sessionId: session.session.id }, select: { sessionId: true } }) : null;
  if (!verified) return { status: "mfa", mode: enrolled ? "verify" : "setup", admin };
  return { status: "ok", admin };
}

/** Same lookup, shared between a layout and its page within one render. */
const resolveAdminForPage = cache(resolveAdmin);

// ---------------------------------------------------------------- API routes

export type ApiAuthResult = { ok: true; admin: AdminContext; context: RequestContext } | { ok: false; response: NextResponse };

function deny(status: 401 | 403, error: string, extra: Record<string, unknown> = {}): ApiAuthResult {
  return { ok: false, response: NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } }) };
}

/**
 * Use at the top of every admin route handler:
 *
 *   const auth = await authorizeAdmin("disputes:resolve");
 *   if (!auth.ok) return auth.response;
 */
export async function authorizeAdmin(permission: AdminPermission): Promise<ApiAuthResult> {
  const resolved = await resolveAdmin();
  if (resolved.status === "anonymous") return deny(401, "Sign in to continue.");
  if (resolved.status === "expired") return deny(401, "Your admin session has expired. Sign in again.");
  if (resolved.status === "not-admin") return deny(403, "Admin access required.");
  if (resolved.status === "mfa") return deny(403, "Two-step verification is required. Open the admin sign-in to finish it.", { twoStep: resolved.mode });
  if (!roleHasPermission(resolved.admin.role, permission)) return deny(403, "You do not have permission to do this.");
  return { ok: true, admin: resolved.admin, context: requestContextFrom(await headers()) };
}

export type PendingAuthResult = { ok: true; admin: AdminContext; mode: MfaMode | "done"; context: RequestContext } | { ok: false; response: NextResponse };

/**
 * For the sign-in steps only (the two-step routes and the sign-in check): accepts an admin whose password was
 * accepted but whose second step is still open. Nothing else may use it.
 */
export async function authorizeAdminSignIn(): Promise<PendingAuthResult> {
  const resolved = await resolveAdmin();
  const refuse = (status: 401 | 403, error: string): PendingAuthResult => ({ ok: false, response: NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } }) });
  if (resolved.status === "anonymous") return refuse(401, "Sign in to continue.");
  if (resolved.status === "expired") return refuse(401, "Your admin session has expired. Sign in again.");
  if (resolved.status === "not-admin") return refuse(403, "Admin access required.");
  return { ok: true, admin: resolved.admin, mode: resolved.status === "mfa" ? resolved.mode : "done", context: requestContextFrom(await headers()) };
}

// --------------------------------------------------------------------- pages

/**
 * Use at the top of every admin server page or layout. Signed-out and expired sessions go to the
 * admin sign-in; signed-in non-admins get a plain 404 so the portal's existence is not advertised.
 */
export async function requireAdminPage(permission: AdminPermission = "dashboard:view"): Promise<AdminContext> {
  const resolved = await resolveAdminForPage();
  if (resolved.status === "anonymous") redirect("/admin/login");
  if (resolved.status === "expired") redirect("/admin/login?expired=1");
  if (resolved.status === "not-admin") notFound();
  if (resolved.status === "mfa") redirect("/admin/two-step");
  if (!roleHasPermission(resolved.admin.role, permission)) {
    if (permission === "dashboard:view") notFound();
    redirect("/admin");
  }
  return resolved.admin;
}
