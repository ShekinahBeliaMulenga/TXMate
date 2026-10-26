import { prisma } from "@/lib/prisma";
import { notifyOnce } from "@/lib/notify";
import type { TutoringSessionWhereInput } from "@/generated/prisma/models/TutoringSession";
import { recordAudit } from "./audit";
import type { AdminContext } from "./guard";
import { canAccessUniversity, universityScopeFilter } from "./permissions";
import { DISPUTE_PAGE_SIZE, NOTE_MAX, NOTE_MIN, type DisputeItem, type DisputeListKind, type DisputeOutcome, type DisputePage } from "./dispute-types";
import type { RequestContext } from "./request-context";

/**
 * Sessions that need a person to decide: attendance answers that did not match, a problem reported
 * during completion, or a completion confirmation that never arrived. This is the same set the
 * student app labels "Needs review" (see `needsReview` in session-lifecycle-rules.ts).
 */
export const OPEN_DISPUTE_WHERE: TutoringSessionWhereInput = {
  status: { in: ["SCHEDULED", "IN_PROGRESS", "DISPUTED"] },
  OR: [
    { status: "DISPUTED" },
    { attendance: { is: { status: "DISPUTED" } } },
    { completionDisputedAt: { not: null } },
    { completionReviewRequiredAt: { not: null } },
  ],
};

export const RESOLVED_DISPUTE_WHERE: TutoringSessionWhereInput = { attendance: { is: { resolvedByAdminId: { not: null } } } };

/** Restricts a session query to the universities this admin may see. */
export function sessionScope(admin: Pick<AdminContext, "scope">): TutoringSessionWhereInput {
  return { request: { is: universityScopeFilter(admin.scope) } };
}

const LIST_SELECT = {
  id: true,
  scheduledStart: true,
  scheduledEnd: true,
  status: true,
  groupId: true,
  meetingLocation: true,
  completionDisputedAt: true,
  completionDisputeReason: true,
  completionReviewRequiredAt: true,
  studentCompletionConfirmedAt: true,
  mateCompletionConfirmedAt: true,
  attendance: {
    select: {
      status: true,
      studentAttended: true,
      studentRespondedAt: true,
      mateConfirmedStudentAttended: true,
      mateRespondedAt: true,
      disputedAt: true,
      disputeReason: true,
      resolvedAt: true,
      resolvedByAdmin: { select: { user: { select: { name: true } } } },
    },
  },
  request: {
    select: {
      arrangementType: true,
      university: { select: { code: true } },
      studentProfile: { select: { studentId: true, user: { select: { name: true } } } },
      offering: { select: { course: { select: { code: true, name: true } }, academicMateProfile: { select: { user: { select: { name: true } } } } } },
    },
  },
} as const;

const YES_NO = (value: boolean | null | undefined) => (value === true ? "Attended" : value === false ? "Didn't attend" : "No answer");

export async function listDisputes(admin: AdminContext, kind: DisputeListKind, cursor: string | null, take = DISPUTE_PAGE_SIZE): Promise<DisputePage> {
  const rows = await prisma.tutoringSession.findMany({
    where: { AND: [kind === "open" ? OPEN_DISPUTE_WHERE : RESOLVED_DISPUTE_WHERE, sessionScope(admin)] },
    orderBy: kind === "open" ? [{ scheduledEnd: "desc" }, { id: "desc" }] : [{ attendance: { resolvedAt: "desc" } }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: LIST_SELECT,
  });

  const page = rows.slice(0, take);
  const items: DisputeItem[] = page.map((row) => {
    const reasons: string[] = [];
    if (row.attendance?.status === "DISPUTED") reasons.push(row.attendance.disputeReason || "The student and the Academic Mate gave different attendance answers.");
    if (row.completionDisputedAt) reasons.push(`Problem reported: ${row.completionDisputeReason || "no details given"}`);
    if (row.completionReviewRequiredAt) reasons.push("The second completion confirmation did not arrive within 12 hours.");
    return {
      id: row.id,
      groupId: row.groupId,
      course: row.request.offering.course,
      university: row.request.university.code,
      student: { name: row.request.studentProfile.user.name, studentId: row.request.studentProfile.studentId },
      mate: { name: row.request.offering.academicMateProfile.user.name },
      scheduledStart: row.scheduledStart.toISOString(),
      scheduledEnd: row.scheduledEnd.toISOString(),
      location: row.meetingLocation,
      arrangementType: row.request.arrangementType,
      reasons,
      studentAnswer: YES_NO(row.attendance?.studentAttended),
      mateAnswer: YES_NO(row.attendance?.mateConfirmedStudentAttended),
      resolvedAt: row.attendance?.resolvedAt?.toISOString() ?? null,
      resolvedBy: row.attendance?.resolvedByAdmin?.user.name ?? null,
    };
  });

  return { items, nextCursor: rows.length > take ? page[page.length - 1].id : null };
}

export async function countOpenDisputes(admin: AdminContext): Promise<number> {
  return prisma.tutoringSession.count({ where: { AND: [OPEN_DISPUTE_WHERE, sessionScope(admin)] } });
}

// ---------------------------------------------------------------- resolving

export type ResolveResult = { ok: true; message: string } | { ok: false; status: 400 | 403 | 404 | 409; error: string };

const fail = (status: 400 | 403 | 404 | 409, error: string): ResolveResult => ({ ok: false, status, error });

/**
 * Records the admin's decision on one session.
 *
 * COMPLETED: the session happened. It is marked completed and a one-time arrangement ends.
 * NO_SHOW:   the session did not happen. It is marked a no-show and a one-time arrangement is released,
 *            so the student can request the course again.
 * Either way the original answers stay on the record, the decision is stamped on the attendance row,
 * both people are told, and an audit entry is written in the same transaction. Safe to retry: a
 * session that is no longer open returns 409 and nothing changes.
 */
export async function resolveDispute(
  admin: AdminContext,
  input: { sessionId: string; outcome: DisputeOutcome; note: string; context: RequestContext },
): Promise<ResolveResult> {
  const now = new Date();
  const note = input.note.trim();
  if (note.length < NOTE_MIN || note.length > NOTE_MAX) return fail(400, `Add a note of ${NOTE_MIN} to ${NOTE_MAX} characters explaining the decision.`);

  return prisma.$transaction(async (tx) => {
    // Same row lock the attendance and completion flows take, so a late answer cannot interleave.
    await tx.$queryRaw`SELECT "id" FROM "TutoringSession" WHERE "id" = ${input.sessionId} FOR UPDATE`;
    const session = await tx.tutoringSession.findFirst({
      where: { id: input.sessionId, AND: [OPEN_DISPUTE_WHERE] },
      select: {
        id: true,
        arrangementId: true,
        status: true,
        request: {
          select: {
            universityId: true,
            arrangementType: true,
            studentProfile: { select: { user: { select: { id: true, name: true } } } },
            offering: { select: { course: { select: { code: true, name: true } }, academicMateProfile: { select: { user: { select: { id: true, name: true } } } } } },
          },
        },
        attendance: { select: { studentAttended: true, mateConfirmedStudentAttended: true } },
      },
    });
    if (!session) {
      // Either it does not exist or someone already settled it. Do not reveal which.
      return fail(409, "This session is no longer waiting for review. Refresh the list.");
    }
    if (!canAccessUniversity(admin.scope, session.request.universityId)) {
      return fail(403, "You do not have access to this university's sessions.");
    }

    const nextStatus = input.outcome === "COMPLETED" ? "COMPLETED" : "NO_SHOW";
    const claim = await tx.tutoringSession.updateMany({
      where: { id: session.id, AND: [OPEN_DISPUTE_WHERE] },
      data: input.outcome === "COMPLETED" ? { status: "COMPLETED", completedAt: now } : { status: "NO_SHOW" },
    });
    if (claim.count !== 1) return fail(409, "This session just changed. Refresh the list.");

    await tx.attendance.upsert({
      where: { sessionId: session.id },
      create: { sessionId: session.id, status: "CONFIRMED", resolvedAt: now, resolvedByAdminId: admin.adminId },
      update: { status: "CONFIRMED", resolvedAt: now, resolvedByAdminId: admin.adminId },
    });

    if (session.request.arrangementType === "ONE_TIME") {
      await tx.mateRequest.updateMany({
        where: { id: session.arrangementId, status: "ACCEPTED", arrangementType: "ONE_TIME", arrangementStatus: { in: ["ACTIVE", "PAUSED", "EXPIRED"] } },
        data: { arrangementStatus: input.outcome === "COMPLETED" ? "COMPLETED" : "EXPIRED" },
      });
    }

    const course = `${session.request.offering.course.code} ${session.request.offering.course.name}`;
    const people = [session.request.studentProfile.user.id, session.request.offering.academicMateProfile.user.id];
    await notifyOnce(tx, people.map((userId) => ({
      userId,
      dedupeKey: `admin-resolved:${session.id}:${userId}`,
      type: input.outcome === "COMPLETED" ? ("SESSION_COMPLETED" as const) : ("SYSTEM" as const),
      title: input.outcome === "COMPLETED" ? "Session confirmed as completed" : "Session recorded as a no-show",
      body: input.outcome === "COMPLETED"
        ? `After review, the TXMate team confirmed your ${course} session as completed.`
        : `After review, the TXMate team recorded your ${course} session as a no-show.`,
      url: `/student/sessions?session=${encodeURIComponent(session.id)}`,
      data: { sessionId: session.id, event: "ADMIN_RESOLVED" },
    })));

    await recordAudit(tx, {
      actor: admin,
      action: "DISPUTE_RESOLVED",
      targetType: "TUTORING_SESSION",
      targetId: session.id,
      universityId: session.request.universityId,
      summary: `Resolved ${course} session as ${nextStatus === "COMPLETED" ? "completed" : "no-show"}`,
      metadata: {
        outcome: input.outcome,
        previousStatus: session.status,
        studentAnswer: YES_NO(session.attendance?.studentAttended),
        mateAnswer: YES_NO(session.attendance?.mateConfirmedStudentAttended),
        note,
      },
      context: input.context,
    });

    return { ok: true as const, message: input.outcome === "COMPLETED" ? "Session confirmed as completed." : "Session recorded as a no-show." };
  }, { timeout: 15_000 });
}
