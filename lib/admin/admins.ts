import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateInvite } from "./admin-invite-rules";
import { recordAudit } from "./audit";
import type { AdminContext } from "./guard";
import { ADMIN_ROLE_LABEL, isAdminRole, type AdminRoleName } from "./permissions";
import type { RequestContext } from "./request-context";

export type Result<T> = ({ ok: true } & T) | { ok: false; status: 400 | 403 | 404 | 409; error: string };
const fail = (status: 400 | 403 | 404 | 409, error: string) => ({ ok: false as const, status, error });

export type AdminRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: AdminRoleName;
  universities: Array<{ id: string; code: string }>;
  createdAt: string;
  /** Invited but has not chosen a password yet. */
  pendingInvite: boolean;
  /** Two-step sign-in is set up and confirmed. */
  twoStep: boolean;
};

export async function listAdmins(): Promise<AdminRow[]> {
  const rows = await prisma.adminProfile.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      role: true,
      createdAt: true,
      user: { select: { name: true, email: true, emailVerified: true, accounts: { where: { providerId: "credential" }, select: { id: true } } } },
      universityAccess: { select: { university: { select: { id: true, code: true } } } },
      twoFactor: { select: { confirmedAt: true } },
    },
  });
  return rows.flatMap((row) =>
    isAdminRole(row.role)
      ? [{ id: row.id, userId: row.userId, name: row.user.name, email: row.user.email, role: row.role, universities: row.universityAccess.map((access) => access.university), createdAt: row.createdAt.toISOString(), pendingInvite: !row.user.emailVerified && row.user.accounts.length === 0, twoStep: Boolean(row.twoFactor?.confirmedAt) }]
      : [],
  );
}

/** Every role except platform admin sees only the universities it was given, so it needs at least one. */
function validateAccess(role: AdminRoleName, universityIds: string[]): string | null {
  if (role !== "PLATFORM_ADMIN" && universityIds.length === 0) return "Choose at least one university for this role.";
  if (universityIds.length > 100) return "Too many universities selected.";
  return null;
}

async function existingUniversityIds(db: Pick<typeof prisma, "university">, ids: string[]): Promise<string[] | null> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const found = await db.university.findMany({ where: { id: { in: unique } }, select: { id: true } });
  return found.length === unique.length ? unique : null;
}

export async function grantAdmin(admin: AdminContext, input: { email: string; role: string; universityIds: string[]; context: RequestContext }): Promise<Result<{ message: string }>> {
  const email = input.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 200) return fail(400, "Enter a valid email address.");
  if (!isAdminRole(input.role)) return fail(400, "Choose a valid role.");
  const role = input.role;
  const access = validateAccess(role, input.universityIds);
  if (access) return fail(400, access);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email }, select: { id: true, name: true, emailVerified: true, adminProfile: { select: { id: true } } } });
    if (!user) return fail(404, "No account has that email. The person must register first.");
    // Never give admin power to an address nobody has proven they own.
    if (!user.emailVerified) return fail(409, "That account’s email isn’t verified yet. Ask them to open the verification link we emailed, then try again.");
    if (user.adminProfile) return fail(409, "That person is already an admin. Edit their access instead.");
    const universityIds = role === "PLATFORM_ADMIN" ? [] : await existingUniversityIds(tx, input.universityIds);
    if (universityIds === null) return fail(400, "One of the selected universities no longer exists.");

    const profile = await tx.adminProfile.create({
      data: { userId: user.id, role, universityAccess: { create: universityIds.map((universityId) => ({ universityId })) } },
      select: { id: true },
    });
    await recordAudit(tx, { actor: admin, action: "ADMIN_GRANTED", targetType: "ADMIN", targetId: profile.id, summary: `Made ${user.name} a ${ADMIN_ROLE_LABEL[role].toLowerCase()}`, metadata: { role, universities: universityIds.length }, context: input.context });
    return { ok: true as const, message: `${user.name} is now a ${ADMIN_ROLE_LABEL[role].toLowerCase()}.` };
  });
}

/** True when changing or removing this admin would leave the platform without a platform admin. */
async function wouldOrphanPlatform(db: Pick<typeof prisma, "adminProfile">, targetId: string): Promise<boolean> {
  const others = await db.adminProfile.count({ where: { role: "PLATFORM_ADMIN", id: { not: targetId } } });
  return others === 0;
}

export async function updateAdmin(admin: AdminContext, input: { adminId: string; role: string; universityIds: string[]; context: RequestContext }): Promise<Result<{ message: string }>> {
  if (!isAdminRole(input.role)) return fail(400, "Choose a valid role.");
  const role = input.role;
  const access = validateAccess(role, input.universityIds);
  if (access) return fail(400, access);

  return prisma.$transaction(async (tx) => {
    const target = await tx.adminProfile.findUnique({ where: { id: input.adminId }, select: { id: true, userId: true, role: true, user: { select: { name: true } } } });
    if (!target) return fail(404, "Admin not found.");
    if (target.userId === admin.userId) return fail(403, "You can’t change your own access. Ask another platform admin.");
    if (target.role === "PLATFORM_ADMIN" && role !== "PLATFORM_ADMIN" && (await wouldOrphanPlatform(tx, target.id))) return fail(409, "This is the only platform admin. Make someone else a platform admin first.");

    const universityIds = role === "PLATFORM_ADMIN" ? [] : await existingUniversityIds(tx, input.universityIds);
    if (universityIds === null) return fail(400, "One of the selected universities no longer exists.");

    await tx.adminProfile.update({ where: { id: target.id }, data: { role } });
    await tx.adminUniversityAccess.deleteMany({ where: { adminProfileId: target.id } });
    if (universityIds.length > 0) await tx.adminUniversityAccess.createMany({ data: universityIds.map((universityId) => ({ adminProfileId: target.id, universityId })) });
    await recordAudit(tx, { actor: admin, action: "ADMIN_UPDATED", targetType: "ADMIN", targetId: target.id, summary: `Set ${target.user.name} to ${ADMIN_ROLE_LABEL[role].toLowerCase()} (${universityIds.length} universities)`, metadata: { from: target.role, to: role, universities: universityIds.length }, context: input.context });
    return { ok: true as const, message: "Access updated. It applies on their next page load." };
  });
}

export async function revokeAdmin(admin: AdminContext, input: { adminId: string; context: RequestContext }): Promise<Result<{ message: string }>> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.adminProfile.findUnique({ where: { id: input.adminId }, select: { id: true, userId: true, role: true, user: { select: { name: true } } } });
    if (!target) return fail(404, "Admin not found.");
    if (target.userId === admin.userId) return fail(403, "You can’t remove your own admin access.");
    if (target.role === "PLATFORM_ADMIN" && (await wouldOrphanPlatform(tx, target.id))) return fail(409, "This is the only platform admin and can’t be removed.");

    await tx.adminProfile.delete({ where: { id: target.id } }); // access rows cascade; past work keeps its record with the admin reference cleared
    // They lose the portal immediately; their student session (if any) is untouched.
    await recordAudit(tx, { actor: admin, action: "ADMIN_REVOKED", targetType: "ADMIN", targetId: target.id, summary: `Removed admin access from ${target.user.name}`, metadata: { role: target.role }, context: input.context });
    return { ok: true as const, message: `${target.user.name} is no longer an admin.` };
  });
}


/** Sends (or re-sends) the invitation link. It is the normal reset link for an account with no password yet. */
async function sendInviteEmail(email: string): Promise<boolean> {
  try {
    await auth.api.requestPasswordReset({ body: { email, redirectTo: "/accept-invite" } });
    return true;
  } catch (error) {
    console.error("Could not send the admin invitation:", error);
    return false;
  }
}

/**
 * Creates an account for someone who has never registered and gives it admin access. The account has no password:
 * the person chooses their own from the emailed link, which also proves they own the address.
 */
export async function inviteAdmin(admin: AdminContext, input: { name: string; email: string; role: string; universityIds: string[]; context: RequestContext }): Promise<Result<{ message: string }>> {
  const checked = validateInvite({ name: input.name, email: input.email });
  if (!checked.ok) return fail(400, checked.message);
  if (!isAdminRole(input.role)) return fail(400, "Choose a valid role.");
  const role = input.role;
  const access = validateAccess(role, input.universityIds);
  if (access) return fail(400, access);

  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email: checked.email }, select: { id: true } });
    if (existing) return fail(409, "That email already has an account. Use “Give access to an existing account” instead.");
    const universityIds = role === "PLATFORM_ADMIN" ? [] : await existingUniversityIds(tx, input.universityIds);
    if (universityIds === null) return fail(400, "One of the selected universities no longer exists.");
    const now = new Date();
    const user = await tx.user.create({ data: { id: crypto.randomUUID(), name: checked.name, email: checked.email, emailVerified: false, createdAt: now, updatedAt: now }, select: { id: true } });
    const profile = await tx.adminProfile.create({
      data: { userId: user.id, role, universityAccess: { create: universityIds.map((universityId) => ({ universityId })) } },
      select: { id: true },
    });
    await recordAudit(tx, { actor: admin, action: "ADMIN_INVITED", targetType: "ADMIN", targetId: profile.id, summary: `Invited ${checked.name} as a ${ADMIN_ROLE_LABEL[role].toLowerCase()}`, metadata: { role, universities: universityIds.length }, context: input.context });
    return { ok: true as const };
  });
  if (!created.ok) return created;

  const sent = await sendInviteEmail(checked.email);
  return sent
    ? { ok: true, message: `Invitation sent to ${checked.email}. They have 1 hour to choose a password; you can send a new one from their row.` }
    : { ok: true, message: `${checked.name} was added, but the email could not be sent. Open their row and choose “Send invitation again”.` };
}

/** Sends a fresh invitation to an admin who has not chosen a password yet. */
export async function resendInvite(admin: AdminContext, input: { adminId: string; context: RequestContext }): Promise<Result<{ message: string }>> {
  const row = await prisma.adminProfile.findUnique({
    where: { id: input.adminId },
    select: { id: true, user: { select: { name: true, email: true, emailVerified: true, accounts: { where: { providerId: "credential" }, select: { id: true } } } } },
  });
  if (!row) return fail(404, "Admin not found.");
  if (row.user.emailVerified || row.user.accounts.length > 0) return fail(409, "This person has already set up their account.");
  const sent = await sendInviteEmail(row.user.email);
  if (!sent) return fail(409, "The email could not be sent. Check the email settings and try again.");
  await prisma.$transaction((tx) => recordAudit(tx, { actor: admin, action: "ADMIN_INVITED", targetType: "ADMIN", targetId: row.id, summary: `Re-sent the invitation to ${row.user.name}`, metadata: { resent: true }, context: input.context }));
  return { ok: true, message: `A new invitation was sent to ${row.user.email}. If it doesn’t arrive, wait a minute before sending again.` };
}

/**
 * Clears an admin's two-step sign-in (lost phone and lost backup codes) and signs them out everywhere.
 * At their next sign-in they must set it up again. Platform admins only, never for yourself: a reset is the
 * way around the second step, so it always takes a second person, and it is written to the audit log.
 */
export async function resetTwoStep(admin: AdminContext, input: { adminId: string; context: RequestContext }): Promise<Result<{ message: string }>> {
  const target = await prisma.adminProfile.findUnique({ where: { id: input.adminId }, select: { id: true, userId: true, user: { select: { name: true } } } });
  if (!target) return fail(404, "That admin no longer exists.");
  if (target.userId === admin.userId) return fail(403, "You can’t reset your own two-step sign-in. Ask another platform admin.");

  return prisma.$transaction(async (tx) => {
    const removed = await tx.adminTwoFactor.deleteMany({ where: { adminProfileId: target.id } });
    await tx.session.deleteMany({ where: { userId: target.userId } });
    await recordAudit(tx, { actor: admin, action: "ADMIN_TWO_STEP_RESET", targetType: "ADMIN", targetId: target.id, summary: `Reset two-step sign-in for ${target.user.name}`, metadata: { hadSetup: removed.count > 0 }, context: input.context });
    return {
      ok: true as const,
      message: removed.count > 0 ? `${target.user.name}’s two-step sign-in was reset and they were signed out. They set it up again at their next sign-in.` : `${target.user.name} had not set up two-step sign-in yet. They were signed out.`,
    };
  });
}
