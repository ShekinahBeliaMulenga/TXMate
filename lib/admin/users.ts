import { prisma } from "@/lib/prisma";
import { notifyOnce } from "@/lib/notify";
import type { UserWhereInput } from "@/generated/prisma/models/User";
import { dayRangeFilter } from "./date-range";
import { recordAudit } from "./audit";
import type { AdminContext } from "./guard";
import { canAccessUniversity, universityScopeFilter } from "./permissions";
import type { RequestContext } from "./request-context";
import { REASON_MAX, REASON_MIN, SEARCH_MAX, USER_PAGE_SIZE, type AccountAction, type AccountScope, type UserPage, type UserRoleFilter, type UserStatusFilter } from "./user-types";

export type Result<T> = ({ ok: true } & T) | { ok: false; status: 400 | 403 | 404 | 409; error: string };
const fail = (status: 400 | 403 | 404 | 409, error: string) => ({ ok: false as const, status, error });

/** Users who are students and/or Academic Mates inside the admin's universities. Admin accounts are never listed. */
function listWhere(admin: AdminContext, q: string, role: UserRoleFilter, status: UserStatusFilter, joined?: { gte?: Date; lt?: Date }): UserWhereInput {
  const scope = universityScopeFilter(admin.scope);
  const profileFilters: UserWhereInput[] = [];
  const studentStatus = status === "suspended" ? { status: "SUSPENDED" as const } : {};
  const mateStatus = status === "suspended" ? { status: "SUSPENDED" as const } : {};
  if (role !== "mates") profileFilters.push({ studentProfile: { is: { ...scope, ...studentStatus } } });
  if (role !== "students") profileFilters.push({ academicMate: { is: { ...scope, ...mateStatus } } });

  const and: UserWhereInput[] = [{ adminProfile: { is: null } }, { OR: profileFilters }];
  if (joined) and.push({ createdAt: joined });
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { studentProfile: { is: { studentId: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  return { AND: and };
}

export async function listUsers(admin: AdminContext, input: { q?: string; role?: UserRoleFilter; status?: UserStatusFilter; from?: string; to?: string; cursor?: string | null }): Promise<UserPage> {
  const q = (input.q ?? "").trim().slice(0, SEARCH_MAX);
  const rows = await prisma.user.findMany({
    where: listWhere(admin, q, input.role ?? "all", input.status ?? "all", dayRangeFilter(input.from, input.to)),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: USER_PAGE_SIZE + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      studentProfile: { select: { studentId: true, status: true, university: { select: { name: true } } } },
      academicMate: { select: { status: true, verificationStatus: true, university: { select: { name: true } } } },
    },
  });
  const page = rows.slice(0, USER_PAGE_SIZE);
  return {
    items: page.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      createdAt: row.createdAt.toISOString(),
      university: row.studentProfile?.university.name ?? row.academicMate?.university.name ?? "—",
      student: row.studentProfile ? { studentId: row.studentProfile.studentId, status: row.studentProfile.status } : null,
      mate: row.academicMate ? { status: row.academicMate.status, verification: row.academicMate.verificationStatus } : null,
    })),
    nextCursor: rows.length > USER_PAGE_SIZE ? page[page.length - 1].id : null,
  };
}

const COPY = {
  STUDENT: {
    SUSPEND: { audit: "STUDENT_SUSPENDED", title: "Your TXMate account was suspended", body: "Your account has been suspended by the TXMate team. Reason: " },
    REACTIVATE: { audit: "STUDENT_REACTIVATED", title: "Your TXMate account was reactivated", body: "Your account is active again. You can sign in and continue. Note: " },
  },
  MATE: {
    SUSPEND: { audit: "MATE_SUSPENDED", title: "Your Academic Mate profile was suspended", body: "Your Academic Mate profile has been hidden and can’t take new requests. Reason: " },
    REACTIVATE: { audit: "MATE_REACTIVATED", title: "Your Academic Mate profile was reactivated", body: "Your Academic Mate profile is active again. Note: " },
  },
} as const;

/**
 * Suspends or reactivates one account scope (student profile or Academic Mate profile).
 * Only ACTIVE <-> SUSPENDED moves are allowed; graduated, withdrawn and inactive accounts are left alone.
 * Suspending a student also signs them out everywhere. Admin accounts and the admin's own account are refused.
 */
export async function changeAccountStatus(
  admin: AdminContext,
  input: { userId: string; scope: AccountScope; action: AccountAction; reason: string; context: RequestContext },
): Promise<Result<{ message: string }>> {
  const reason = input.reason.trim();
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) return fail(400, `Give a reason of ${REASON_MIN} to ${REASON_MAX} characters.`);
  if (input.userId === admin.userId) return fail(403, "You can’t change your own account.");

  const from = input.action === "SUSPEND" ? "ACTIVE" : "SUSPENDED";
  const to = input.action === "SUSPEND" ? "SUSPENDED" : "ACTIVE";
  const copy = COPY[input.scope][input.action];

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        name: true,
        adminProfile: { select: { id: true } },
        studentProfile: { select: { id: true, universityId: true, status: true } },
        academicMate: { select: { id: true, universityId: true, status: true } },
      },
    });
    const profile = user ? (input.scope === "STUDENT" ? user.studentProfile : user.academicMate) : null;
    if (!user || !profile) return fail(404, "Account not found.");
    if (user.adminProfile) return fail(403, "Admin accounts can’t be suspended from here.");
    if (!canAccessUniversity(admin.scope, profile.universityId)) return fail(403, "You do not have access to this university.");

    const claim = input.scope === "STUDENT"
      ? await tx.studentProfile.updateMany({ where: { id: profile.id, status: from }, data: { status: to } })
      : await tx.academicMateProfile.updateMany({ where: { id: profile.id, status: from }, data: { status: to } });
    if (claim.count !== 1) return fail(409, `This account is ${profile.status.toLowerCase()}, so it can’t be ${input.action === "SUSPEND" ? "suspended" : "reactivated"}. Refresh the page.`);

    // A suspended student must not keep using an old session.
    if (input.scope === "STUDENT" && input.action === "SUSPEND") await tx.session.deleteMany({ where: { userId: user.id } });

    await notifyOnce(tx, [{
      userId: user.id,
      dedupeKey: `account-status:${input.scope}:${profile.id}:${to}:${Date.now()}`,
      title: copy.title,
      body: `${copy.body}${reason}`,
      url: input.scope === "MATE" ? "/student/academic-mate/profile" : "/student/dashboard",
      data: { event: copy.audit },
    }]);

    await recordAudit(tx, {
      actor: admin,
      action: copy.audit,
      targetType: input.scope === "STUDENT" ? "STUDENT" : "ACADEMIC_MATE",
      targetId: profile.id,
      universityId: profile.universityId,
      summary: `${input.action === "SUSPEND" ? "Suspended" : "Reactivated"} ${input.scope === "STUDENT" ? "student" : "Academic Mate"} ${user.name}`,
      metadata: { userId: user.id, reason },
      context: input.context,
    });

    return { ok: true as const, message: input.action === "SUSPEND" ? "Account suspended." : "Account reactivated." };
  });
}


export type UserDetail = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  anonymised: boolean;
  university: string;
  student: { studentId: string; status: string; programme: string } | null;
  mate: { status: string; verification: string; headline: string | null; profileId: string } | null;
  history: Array<{ id: string; action: string; actorName: string; summary: string | null; createdAt: string }>;
};

/** One account with its profile statuses and recent admin actions. Returns null when missing, an admin, or out of scope. */
export async function getUserDetail(admin: AdminContext, userId: string): Promise<UserDetail | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      anonymisedAt: true,
      adminProfile: { select: { id: true } },
      studentProfile: { select: { id: true, universityId: true, studentId: true, status: true, university: { select: { name: true } }, programme: { select: { name: true } } } },
      academicMate: { select: { id: true, universityId: true, status: true, verificationStatus: true, headline: true, university: { select: { name: true } } } },
    },
  });
  if (!user || user.adminProfile) return null;
  const universityId = user.studentProfile?.universityId ?? user.academicMate?.universityId;
  if (!universityId || !canAccessUniversity(admin.scope, universityId)) return null;

  const targetIds = [user.studentProfile?.id, user.academicMate?.id].filter((id): id is string => Boolean(id));
  const history = await prisma.adminAuditLog.findMany({
    where: { targetId: { in: targetIds }, targetType: { in: ["STUDENT", "ACADEMIC_MATE"] } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, action: true, actorName: true, summary: true, createdAt: true },
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    anonymised: user.anonymisedAt !== null,
    university: user.studentProfile?.university.name ?? user.academicMate?.university.name ?? "—",
    student: user.studentProfile ? { studentId: user.studentProfile.studentId, status: user.studentProfile.status, programme: user.studentProfile.programme.name } : null,
    mate: user.academicMate ? { status: user.academicMate.status, verification: user.academicMate.verificationStatus, headline: user.academicMate.headline, profileId: user.academicMate.id } : null,
    history: history.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
  };
}
