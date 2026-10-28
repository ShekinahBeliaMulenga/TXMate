/**
 * Writes for the session attendance + completion workflow.
 *
 * Every public function runs in one transaction that first locks the session row
 * (and shares-locks its arrangement row), so two answers arriving together, a
 * cancellation, or the scheduler can never interleave. All state changes are
 * conditional `updateMany`s filtered on the expected current status, so a cancelled
 * session can never be revived by a late answer or a scheduled job.
 *
 * The decisions themselves live in `session-lifecycle-rules.ts`.
 */
import type { TutoringSessionWhereInput } from "@/generated/prisma/models/TutoringSession";
import { prisma } from "@/lib/prisma";
import { DEFAULT_MEETING_LOCATION, checkVenue } from "@/lib/session-venue";
import { groupUrl, notifyOnce, sessionUrl } from "@/lib/notify";
import {
  acceptsResponses,
  attendanceOpensAt,
  attendanceOutcome,
  availableActions,
  compareAttendance,
  completionDeadlineExpired,
  evaluateCompletion,
  isCancelled,
  ANSWER_CHANGE_WINDOW_MS,
  answerChangeTimeLeftMs,
  MAX_STUDENT_ANSWER_CHANGES,
  needsReview,
  type LifecycleSnapshot,
  type Role,
} from "@/lib/session-lifecycle-rules";
import { SESSION_SELECT, type SessionRecord } from "@/lib/session-lifecycle-serialize";
import type { GroupSheet, GroupSheetRow } from "@/lib/session-lifecycle-types";

type Db = typeof prisma;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

const OPEN_STATUSES = ["SCHEDULED", "IN_PROGRESS"] as const;
const UNRESOLVED_STATUSES = ["SCHEDULED", "IN_PROGRESS", "DISPUTED"] as const;
/** Arrangement must still be live at the moment of the write, not just when we read it. */
/** Added to every conditional write so nothing changes once the arrangement has been cancelled or closed. */
const LIVE_ARRANGEMENT: Pick<TutoringSessionWhereInput, "request"> = { request: { is: { status: "ACCEPTED", arrangementStatus: { in: ["ACTIVE", "PAUSED"] } } } };
const CLOCK = new Intl.DateTimeFormat("en-ZM", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Lusaka" });

export type ActionResult =
  | { ok: true; message: string; changed: boolean }
  | { ok: false; status: number; message: string };

const fail = (status: number, message: string): ActionResult => ({ ok: false, status, message });

export function recordSnapshot(record: SessionRecord): LifecycleSnapshot {
  return {
    status: record.status,
    scheduledStart: record.scheduledStart,
    scheduledEnd: record.scheduledEnd,
    requestStatus: record.request.status,
    arrangementStatus: record.request.arrangementStatus,
    completedAt: record.completedAt,
    studentCompletionConfirmedAt: record.studentCompletionConfirmedAt,
    mateCompletionConfirmedAt: record.mateCompletionConfirmedAt,
    completionDisputedAt: record.completionDisputedAt,
    completionReviewRequiredAt: record.completionReviewRequiredAt,
    attendance: record.attendance,
  };
}

export function roleOf(record: SessionRecord, userId: string): Role | null {
  if (record.request.studentProfile.userId === userId) return "STUDENT";
  if (record.request.offering.academicMateProfile.userId === userId) return "ACADEMIC_MATE";
  return null;
}

/**
 * Locks the session row, then loads it. Only the session row is locked: the cancel and
 * cancel-arrangement routes take session and arrangement rows in opposite orders, so also
 * locking the arrangement here could deadlock with them. Instead every write below
 * re-checks the arrangement inside its own conditional UPDATE (see LIVE_ARRANGEMENT).
 */
async function loadLocked(tx: Tx, sessionId: string): Promise<SessionRecord | null> {
  await tx.$queryRaw`SELECT "id" FROM "TutoringSession" WHERE "id" = ${sessionId} FOR UPDATE`;
  return tx.tutoringSession.findUnique({ where: { id: sessionId }, select: SESSION_SELECT });
}

/** Sessions start themselves: do not depend on the cron having run to accept answers. */
async function startIfDue(tx: Tx, record: SessionRecord, now: Date): Promise<SessionRecord> {
  if (record.status !== "SCHEDULED" || record.scheduledStart.getTime() > now.getTime()) return record;
  if (record.request.status !== "ACCEPTED" || record.request.arrangementStatus !== "ACTIVE") return record;
  const started = await tx.tutoringSession.updateMany({ where: { id: record.id, status: "SCHEDULED" }, data: { status: "IN_PROGRESS" } });
  return started.count === 1 ? { ...record, status: "IN_PROGRESS" } : record;
}

function otherUser(record: SessionRecord, role: Role) {
  const student = record.request.studentProfile;
  const mate = record.request.offering.academicMateProfile;
  return role === "STUDENT"
    ? { userId: mate.userId, name: mate.user.name || "your Academic Mate" }
    : { userId: student.userId, name: student.user.name || "the student" };
}
const courseLabel = (record: SessionRecord) => `${record.request.offering.course.code} · ${record.request.offering.course.name}`;
/** Where a notification should take this user: the mate's group sheet, or the session itself. */
function urlFor(record: SessionRecord, userId: string): string {
  const isMate = record.request.offering.academicMateProfile.userId === userId;
  return isMate && record.groupId ? groupUrl(record.groupId) : sessionUrl(record.id);
}
const bothUsers = (record: SessionRecord) => [record.request.studentProfile.userId, record.request.offering.academicMateProfile.userId];

/** Why an action is not available, in plain English. */
function changeBlockedReason(record: SessionRecord, now: number): string {
  if (record.attendance?.mateConfirmedStudentAttended != null) return "Your answer is locked because the Academic Mate has already responded.";
  if (answerChangeTimeLeftMs(recordSnapshot(record), now) === 0) return `Answers can only be changed for ${ANSWER_CHANGE_WINDOW_MS / 60_000} minutes after you give them, and that time has passed.`;
  return `You can only change your answer ${MAX_STUDENT_ANSWER_CHANGES} times, and you've used them all.`;
}

function whyBlocked(record: SessionRecord, role: Role, action: "attendance" | "completion" | "dispute", now: number): string {
  const snapshot = recordSnapshot(record);
  const start = record.scheduledStart.getTime();
  const end = record.scheduledEnd.getTime();
  if (isCancelled(snapshot)) return "This session was cancelled, so it can't accept responses.";
  if (record.status === "COMPLETED") return "This session is already completed.";
  if (record.status === "NO_SHOW") return "This session was recorded as a no-show.";
  if (record.request.status !== "ACCEPTED" || !["ACTIVE", "PAUSED"].includes(record.request.arrangementStatus)) return "This tutoring arrangement is no longer active.";
  if (record.request.arrangementStatus === "PAUSED" && record.status !== "IN_PROGRESS") return "This arrangement is paused. Responses reopen when it resumes.";
  if (needsReview(snapshot, now)) return "This session is waiting for review, so it can't take more responses.";
  if (action === "attendance") {
    if (now < start) return "The session hasn't started yet.";
    const opens = attendanceOpensAt(role, start, end);
    if (now < opens) return `Attendance opens at ${CLOCK.format(opens)}.`;
    if (role === "ACADEMIC_MATE" && record.attendance?.studentAttended == null) return "This student hasn't answered yet. You can confirm once they have.";
    return "You've already answered.";
  }
  if (action === "completion") {
    if (now < end) return `Completion opens when the session ends at ${CLOCK.format(end)}.`;
    if (attendanceOutcome(snapshot) !== "VERIFIED") return "Completion can be confirmed once you both agree that the student attended.";
    return "You've already confirmed completion.";
  }
  return `You can report a problem once the session ends at ${CLOCK.format(end)}.`;
}

// --------------------------------------------------------------- review flag

/** Flags a session whose second completion confirmation is overdue. Idempotent. */
export async function flagOverdueCompletion(tx: Tx, record: SessionRecord, now: Date): Promise<boolean> {
  const snapshot = recordSnapshot(record);
  if (!completionDeadlineExpired(snapshot, now.getTime()) || record.completionReviewRequiredAt || record.completionDisputedAt) return false;
  const claim = await tx.tutoringSession.updateMany({
    where: { id: record.id, status: { in: [...OPEN_STATUSES] }, completionReviewRequiredAt: null, completionDisputedAt: null, ...LIVE_ARRANGEMENT },
    data: { completionReviewRequiredAt: now },
  });
  if (claim.count !== 1) return false;
  await notifyOnce(tx, bothUsers(record).map((userId) => ({
    userId,
    dedupeKey: `review:completion-overdue:${record.id}:${userId}`,
    title: "Session sent for review",
    body: `The other confirmation for your ${courseLabel(record)} session didn't arrive within 12 hours, so it needs review.`,
    url: urlFor(record, userId),
    data: { sessionId: record.id, event: "COMPLETION_REVIEW_REQUIRED" },
  })));
  return true;
}

// ---------------------------------------------------------------- attendance

async function applyAttendanceOutcome(tx: Tx, record: SessionRecord, now: Date): Promise<string> {
  const attendance = await tx.attendance.findUnique({ where: { sessionId: record.id } });
  if (!attendance) return "PENDING";
  const outcome = compareAttendance(attendance.studentAttended, attendance.mateConfirmedStudentAttended);
  const users = bothUsers(record);
  const label = courseLabel(record);
  if (outcome === "VERIFIED") {
    await tx.attendance.update({ where: { sessionId: record.id }, data: { status: "CONFIRMED", disputedAt: null, disputeReason: null } });
  } else if (outcome === "NO_SHOW") {
    await tx.attendance.update({ where: { sessionId: record.id }, data: { status: "CONFIRMED" } });
    const moved = await tx.tutoringSession.updateMany({ where: { id: record.id, status: { in: [...OPEN_STATUSES] }, ...LIVE_ARRANGEMENT }, data: { status: "NO_SHOW" } });
    if (moved.count === 1) {
      await notifyOnce(tx, users.map((userId) => ({
        userId, dedupeKey: `att:no-show:${record.id}:${userId}`,
        title: "Session marked as a no-show",
        body: `You both reported that nobody attended your ${label} session.`,
        url: urlFor(record, userId), data: { sessionId: record.id, event: "SESSION_NO_SHOW" },
      })));
    }
  } else if (outcome === "DISPUTED") {
    await tx.attendance.update({
      where: { sessionId: record.id },
      data: { status: "DISPUTED", disputedAt: now, disputeReason: "The student and the Academic Mate gave different attendance answers." },
    });
    const moved = await tx.tutoringSession.updateMany({ where: { id: record.id, status: { in: [...OPEN_STATUSES] }, ...LIVE_ARRANGEMENT }, data: { status: "DISPUTED" } });
    if (moved.count === 1) {
      await notifyOnce(tx, users.map((userId) => ({
        userId, dedupeKey: `att:disputed:${record.id}:${userId}`,
        title: "Attendance needs review",
        body: `Your answers for the ${label} session don't match. The TXMate team will review it.`,
        url: urlFor(record, userId), data: { sessionId: record.id, event: "ATTENDANCE_DISPUTED" },
      })));
    }
  } else {
    await tx.attendance.update({ where: { sessionId: record.id }, data: { status: attendance.studentAttended === true ? "STUDENT_CHECKED_IN" : "PENDING" } });
  }
  return outcome;
}

/** Records one side's attendance answer for one session. Runs inside the caller's transaction. */
export async function recordAttendanceTx(tx: Tx, input: { sessionId: string; role: Role; attended: boolean; now: Date }): Promise<ActionResult> {
  const { sessionId, role, attended, now } = input;
  const loaded = await loadLocked(tx, sessionId);
  if (!loaded) return fail(404, "Session not found.");
  const record = await startIfDue(tx, loaded, now);
  const snapshot = recordSnapshot(record);
  const actions = availableActions(snapshot, role, now.getTime());
  const own = role === "STUDENT" ? record.attendance?.studentAttended ?? null : record.attendance?.mateConfirmedStudentAttended ?? null;

  if (own !== null && own === attended && acceptsResponses(snapshot)) return { ok: true, message: "Your answer was already saved.", changed: false };
  const isChange = own !== null;
  if (isChange ? !actions.changeAttendance : !actions.attendance) {
    return fail(409, isChange ? changeBlockedReason(record, now.getTime()) : whyBlocked(record, role, "attendance", now.getTime()));
  }

  const stillOpen = await tx.tutoringSession.count({ where: { id: sessionId, status: { in: [...OPEN_STATUSES] }, ...LIVE_ARRANGEMENT } });
  if (stillOpen !== 1) return fail(409, "This session was just cancelled or closed, so it can't take an answer.");
  await tx.attendance.createMany({ data: [{ sessionId }], skipDuplicates: true });
  const answer = role === "STUDENT"
    ? { studentAttended: attended, studentRespondedAt: now, studentCheckedInAt: attended ? now : null, ...(isChange ? { studentAnswerChanges: { increment: 1 } } : {}) }
    : { mateConfirmedStudentAttended: attended, mateRespondedAt: now, mateConfirmedAt: attended ? now : null };
  const claim = await tx.attendance.updateMany({
    where: role === "STUDENT"
      ? { sessionId, status: { not: "DISPUTED" }, studentAttended: isChange ? { not: null } : null, mateConfirmedStudentAttended: isChange ? null : undefined, ...(isChange ? { studentAnswerChanges: { lt: MAX_STUDENT_ANSWER_CHANGES }, studentRespondedAt: { gte: new Date(now.getTime() - ANSWER_CHANGE_WINDOW_MS) } } : {}) }
      : { sessionId, status: { not: "DISPUTED" }, mateConfirmedStudentAttended: null },
    data: answer,
  });
  if (claim.count !== 1) return fail(409, "This session just changed. Please refresh and try again.");

  const outcome = await applyAttendanceOutcome(tx, record, now);
  const message = outcome === "VERIFIED" ? "Attendance verified."
    : outcome === "NO_SHOW" ? "Recorded as a no-show."
    : outcome === "DISPUTED" ? "Your answers don't match, so the session was sent for review."
    : "Saved. We're waiting for the other person's answer.";
  return { ok: true, message, changed: true };
}

export async function submitAttendance(input: { sessionId: string; userId: string; attended: boolean }): Promise<ActionResult> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const record = await tx.tutoringSession.findUnique({ where: { id: input.sessionId }, select: SESSION_SELECT });
    const role = record ? roleOf(record, input.userId) : null;
    if (!record || !role) return fail(404, "Session not found.");
    return recordAttendanceTx(tx, { sessionId: input.sessionId, role, attended: input.attended, now });
  }, { timeout: 15_000 });
}

// ---------------------------------------------------------------- completion

async function finalizeCompletion(tx: Tx, record: SessionRecord, now: Date): Promise<boolean> {
  const done = await tx.tutoringSession.updateMany({
    where: { id: record.id, status: { in: [...OPEN_STATUSES] }, completionDisputedAt: null, completionReviewRequiredAt: null, ...LIVE_ARRANGEMENT },
    data: { status: "COMPLETED", completedAt: now },
  });
  if (done.count !== 1) return false;
  // A one-time arrangement ends with its only session. A recurring one carries on
  // (neither the arrangement nor its shared conversation is touched) unless its end date
  // has passed and this was the last open session.
  if (record.request.arrangementType === "RECURRING" && record.request.recurrenceEndsAt && record.request.recurrenceEndsAt.getTime() <= now.getTime()) {
    // Same lock the recurring generator takes before it creates an occurrence.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`arrangement:${record.arrangementId}`}, 0))`;
    await tx.mateRequest.updateMany({
      where: {
        id: record.arrangementId,
        status: "ACCEPTED",
        arrangementType: "RECURRING",
        arrangementStatus: { in: ["ACTIVE", "PAUSED"] },
        recurrenceEndsAt: { lte: now },
        sessions: { none: { id: { not: record.id }, status: { in: [...UNRESOLVED_STATUSES] } } },
      },
      data: { arrangementStatus: "COMPLETED" },
    });
  }
  if (record.request.arrangementType === "ONE_TIME") {
    await tx.mateRequest.updateMany({
      where: {
        id: record.arrangementId,
        status: "ACCEPTED",
        arrangementType: "ONE_TIME",
        arrangementStatus: { in: ["ACTIVE", "PAUSED"] },
        sessions: { none: { id: { not: record.id }, status: { in: [...UNRESOLVED_STATUSES] } } },
      },
      data: { arrangementStatus: "COMPLETED" },
    });
  }
  await notifyOnce(tx, bothUsers(record).map((userId) => ({
    userId, type: "SESSION_COMPLETED" as const, dedupeKey: `completed:${record.id}:${userId}`,
    title: "Session completed",
    body: `Your ${courseLabel(record)} session is confirmed as completed.`,
    url: urlFor(record, userId), data: { sessionId: record.id, event: "SESSION_COMPLETED" },
  })));
  return true;
}

export async function confirmCompletionTx(tx: Tx, input: { sessionId: string; role: Role; now: Date }): Promise<ActionResult> {
  const { sessionId, role, now } = input;
  const loaded = await loadLocked(tx, sessionId);
  if (!loaded) return fail(404, "Session not found.");
  const record = await startIfDue(tx, loaded, now);
  // Self-heal an overdue confirmation so the flag exists even if the scheduler is late.
  if (await flagOverdueCompletion(tx, record, now)) return fail(409, "The 12-hour confirmation window passed, so this session was sent for review.");
  const snapshot = recordSnapshot(record);
  const ownAt = role === "STUDENT" ? record.studentCompletionConfirmedAt : record.mateCompletionConfirmedAt;
  if (ownAt && acceptsResponses(snapshot)) return { ok: true, message: "You already confirmed this session.", changed: false };
  if (!availableActions(snapshot, role, now.getTime()).completion) return fail(409, whyBlocked(record, role, "completion", now.getTime()));

  const claim = await tx.tutoringSession.updateMany({
    where: { id: sessionId, status: { in: [...OPEN_STATUSES] }, completionDisputedAt: null, completionReviewRequiredAt: null, ...LIVE_ARRANGEMENT, ...(role === "STUDENT" ? { studentCompletionConfirmedAt: null } : { mateCompletionConfirmedAt: null }) },
    data: role === "STUDENT" ? { studentCompletionConfirmedAt: now } : { mateCompletionConfirmedAt: now },
  });
  if (claim.count !== 1) return fail(409, "This session just changed. Please refresh and try again.");

  const fresh = await tx.tutoringSession.findUnique({ where: { id: sessionId }, select: SESSION_SELECT });
  if (!fresh) return fail(404, "Session not found.");
  if (evaluateCompletion(recordSnapshot(fresh), now.getTime()) === "COMPLETED" && await finalizeCompletion(tx, fresh, now)) {
    return { ok: true, message: "Session completed. Thank you!", changed: true };
  }
  const other = otherUser(record, role);
  // The mate answers for a whole group at once, so students never nag them one by one.
  if (other.userId === record.request.offering.academicMateProfile.userId && record.groupId) {
    return { ok: true, message: `Confirmed. ${other.name} has 12 hours to confirm too.`, changed: true };
  }
  await notifyOnce(tx, [{
    userId: other.userId, dedupeKey: `completion:first:${sessionId}`,
    title: "Please confirm your session",
    body: `${role === "STUDENT" ? record.request.studentProfile.user.name || "The student" : record.request.offering.academicMateProfile.user.name || "Your Academic Mate"} confirmed your ${courseLabel(record)} session. You have 12 hours to confirm.`,
    url: urlFor(record, other.userId),
    data: { sessionId, event: "COMPLETION_CONFIRM_REQUESTED" },
  }]);
  return { ok: true, message: `Confirmed. ${other.name} has 12 hours to confirm too.`, changed: true };
}

export async function confirmCompletion(input: { sessionId: string; userId: string }): Promise<ActionResult> {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const record = await tx.tutoringSession.findUnique({ where: { id: input.sessionId }, select: SESSION_SELECT });
    const role = record ? roleOf(record, input.userId) : null;
    if (!record || !role) return fail(404, "Session not found.");
    return confirmCompletionTx(tx, { sessionId: input.sessionId, role, now });
  }, { timeout: 15_000 });
  return result;
}

export async function disputeCompletion(input: { sessionId: string; userId: string; reason: string }): Promise<ActionResult> {
  const now = new Date();
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) return fail(400, "Please describe the problem in 3 to 500 characters.");
  return prisma.$transaction(async (tx) => {
    const loaded = await loadLocked(tx, input.sessionId);
    const role = loaded ? roleOf(loaded, input.userId) : null;
    if (!loaded || !role) return fail(404, "Session not found.");
    const record = await startIfDue(tx, loaded, now);
    if (await flagOverdueCompletion(tx, record, now)) return fail(409, "The 12-hour confirmation window passed, so this session was sent for review.");
    const snapshot = recordSnapshot(record);
    // Allowed even while attendance is unresolved. It never completes anything.
    if (!availableActions(snapshot, role, now.getTime()).dispute) return fail(409, whyBlocked(record, role, "dispute", now.getTime()));
    const claim = await tx.tutoringSession.updateMany({
      where: { id: input.sessionId, status: { in: [...OPEN_STATUSES] }, completionDisputedAt: null, ...LIVE_ARRANGEMENT },
      data: { status: "DISPUTED", completionDisputedAt: now, completionDisputedByUserId: input.userId, completionDisputeReason: reason },
    });
    if (claim.count !== 1) return fail(409, "This session just changed. Please refresh and try again.");
    const other = otherUser(record, role);
    await notifyOnce(tx, [{
      userId: other.userId, dedupeKey: `completion:dispute:${input.sessionId}`,
      title: "A problem was reported",
      body: `${role === "STUDENT" ? record.request.studentProfile.user.name || "The student" : record.request.offering.academicMateProfile.user.name || "Your Academic Mate"} reported a problem with your ${courseLabel(record)} session. It's now under review.`,
      url: urlFor(record, other.userId), data: { sessionId: input.sessionId, event: "COMPLETION_DISPUTED" },
    }]);
    return { ok: true as const, message: "Reported. The TXMate team will review this session.", changed: true };
  }, { timeout: 15_000 });
}

// -------------------------------------------------------------------- groups

type GroupSessionRow = { id: string; offeringId: string; scheduledStart: Date; scheduledEnd: Date; groupId: string | null; group: { scheduledStart: Date; scheduledEnd: Date } | null };

/**
 * Bundles sessions that share an offering and an exact time window into one group.
 * Idempotent; also repairs sessions whose time moved (rescheduled) since they were grouped.
 */
export async function attachSessionsToGroups(db: Pick<Db, "sessionGroup" | "tutoringSession">, rows: GroupSessionRow[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const needing = rows.filter((row) => !row.groupId || !row.group || row.group.scheduledStart.getTime() !== row.scheduledStart.getTime() || row.group.scheduledEnd.getTime() !== row.scheduledEnd.getTime());
  for (const row of rows) if (row.groupId && !needing.includes(row)) result.set(row.id, row.groupId);
  if (needing.length === 0) return result;
  const keys = new Map<string, GroupSessionRow[]>();
  for (const row of needing) {
    const key = `${row.offeringId}|${row.scheduledStart.getTime()}|${row.scheduledEnd.getTime()}`;
    keys.set(key, [...(keys.get(key) ?? []), row]);
  }
  const specs = [...keys.values()].map((members) => ({ offeringId: members[0].offeringId, scheduledStart: members[0].scheduledStart, scheduledEnd: members[0].scheduledEnd }));
  await db.sessionGroup.createMany({ data: specs, skipDuplicates: true });
  const groups = await db.sessionGroup.findMany({ where: { OR: specs }, select: { id: true, offeringId: true, scheduledStart: true, scheduledEnd: true } });
  for (const group of groups) {
    const key = `${group.offeringId}|${group.scheduledStart.getTime()}|${group.scheduledEnd.getTime()}`;
    const members = keys.get(key);
    if (!members) continue;
    await db.tutoringSession.updateMany({ where: { id: { in: members.map((member) => member.id) }, status: { in: [...UNRESOLVED_STATUSES] } }, data: { groupId: group.id } });
    for (const member of members) result.set(member.id, group.id);
  }
  return result;
}

async function loadGroupMembers(db: Pick<Db, "tutoringSession">, group: { id: string; scheduledStart: Date; scheduledEnd: Date }) {
  const members = await db.tutoringSession.findMany({
    where: { groupId: group.id, scheduledStart: group.scheduledStart, scheduledEnd: group.scheduledEnd },
    select: SESSION_SELECT,
    orderBy: [{ request: { studentProfile: { user: { name: "asc" } } } }, { id: "asc" }],
  });
  return members.filter((member) => !isCancelled(recordSnapshot(member)));
}

export async function getGroupSheet(groupId: string, userId: string, now = new Date()): Promise<GroupSheet | null> {
  const group = await prisma.sessionGroup.findUnique({
    where: { id: groupId },
    select: { id: true, scheduledStart: true, scheduledEnd: true, mateAttendanceSubmittedAt: true, mateCompletionSubmittedAt: true, offering: { select: { course: { select: { code: true, name: true } }, academicMateProfile: { select: { userId: true } } } } },
  });
  if (!group || group.offering.academicMateProfile.userId !== userId) return null;
  const members = await loadGroupMembers(prisma, group);
  const nowMs = now.getTime();
  const rows: GroupSheetRow[] = members.map((member) => {
    const snapshot = recordSnapshot(member);
    const actions = availableActions(snapshot, "ACADEMIC_MATE", nowMs);
    return {
      sessionId: member.id,
      studentName: member.request.studentProfile.user.name || "Student",
      studentImage: member.request.studentProfile.user.image,
      studentAttended: member.attendance?.studentAttended ?? null,
      studentRespondedAt: member.attendance?.studentRespondedAt?.toISOString() ?? null,
      mateAttended: member.attendance?.mateConfirmedStudentAttended ?? null,
      outcome: attendanceOutcome(snapshot),
      answerable: actions.attendance,
      completionEligible: actions.completion,
      completionConfirmedByMate: member.mateCompletionConfirmedAt !== null,
      studentConfirmedCompletion: member.studentCompletionConfirmedAt !== null,
      needsReview: needsReview(snapshot, nowMs),
      status: member.status,
      suggestedLocation: member.suggestedLocation,
    };
  });
  return {
    id: group.id,
    course: group.offering.course,
    scheduledStart: group.scheduledStart.toISOString(),
    scheduledEnd: group.scheduledEnd.toISOString(),
    meetingLocation: members[0]?.meetingLocation ?? DEFAULT_MEETING_LOCATION,
    recurring: members.some((member) => member.request.arrangementType === "RECURRING"),
    attendanceOpensAt: new Date(attendanceOpensAt("ACADEMIC_MATE", group.scheduledStart.getTime(), group.scheduledEnd.getTime())).toISOString(),
    attendanceSubmittedAt: group.mateAttendanceSubmittedAt?.toISOString() ?? null,
    completionSubmittedAt: group.mateCompletionSubmittedAt?.toISOString() ?? null,
    rows,
    actions: { attendance: rows.some((row) => row.answerable), completion: rows.some((row) => row.completionEligible) },
    detailUrl: groupUrl(group.id),
  };
}

async function lockOwnedGroup(tx: Tx, groupId: string, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`session-group:${groupId}`}, 0))`;
  const group = await tx.sessionGroup.findUnique({
    where: { id: groupId },
    select: { id: true, scheduledStart: true, scheduledEnd: true, offering: { select: { academicMateProfile: { select: { userId: true } } } } },
  });
  return group && group.offering.academicMateProfile.userId === userId ? group : null;
}

/** One submit for the whole group. `responses` holds the mate's yes/no for each student. */
export async function submitGroupAttendance(input: { groupId: string; userId: string; responses: { sessionId: string; attended: boolean }[] }): Promise<ActionResult & { skipped?: number }> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const group = await lockOwnedGroup(tx, input.groupId, input.userId);
    if (!group) return fail(404, "Attendance sheet not found.");
    const members = await loadGroupMembers(tx, group);
    const answers = new Map<string, boolean>();
    for (const response of input.responses) {
      if (!members.some((member) => member.id === response.sessionId)) return fail(400, "One of the students is not part of this session.");
      answers.set(response.sessionId, response.attended);
    }
    const nowMs = now.getTime();
    const answerable = members.filter((member) => availableActions(recordSnapshot(member), "ACADEMIC_MATE", nowMs).attendance);
    if (answerable.length === 0) {
      const opens = attendanceOpensAt("ACADEMIC_MATE", group.scheduledStart.getTime(), group.scheduledEnd.getTime());
      return fail(409, nowMs < opens ? `Attendance opens at ${CLOCK.format(opens)}.` : "Everyone on this sheet has already been confirmed, or can't take answers.");
    }
    const missing = answerable.filter((member) => !answers.has(member.id));
    if (missing.length > 0) return fail(400, `Choose Attended or Didn't attend for every student (${missing.length} left).`);

    let saved = 0;
    let firstFailure: ActionResult | null = null;
    for (const member of answerable) {
      const result = await recordAttendanceTx(tx, { sessionId: member.id, role: "ACADEMIC_MATE", attended: answers.get(member.id) as boolean, now });
      if (result.ok) saved++; else firstFailure ??= result;
    }
    if (saved === 0) return firstFailure ?? fail(409, "Nothing could be saved.");
    await tx.sessionGroup.update({ where: { id: group.id }, data: { mateAttendanceSubmittedAt: now, mateAttendanceSubmittedByUserId: input.userId } });
    const skipped = answerable.length - saved;
    return { ok: true as const, changed: true, skipped, message: skipped > 0 ? `Attendance submitted. ${skipped} ${skipped === 1 ? "student" : "students"} couldn't be updated.` : "Attendance submitted. We'll compare it with the students' answers." };
  }, { timeout: 30_000 });
}

/** One tap for the whole group: confirm completion for every student whose attendance is verified. */
export async function confirmGroupCompletion(input: { groupId: string; userId: string }): Promise<ActionResult & { skipped?: number }> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const group = await lockOwnedGroup(tx, input.groupId, input.userId);
    if (!group) return fail(404, "Attendance sheet not found.");
    const members = await loadGroupMembers(tx, group);
    const nowMs = now.getTime();
    const eligible = members.filter((member) => availableActions(recordSnapshot(member), "ACADEMIC_MATE", nowMs).completion);
    if (eligible.length === 0) return fail(409, nowMs < group.scheduledEnd.getTime() ? `Completion opens when the session ends at ${CLOCK.format(group.scheduledEnd)}.` : "No student here is ready for completion yet. Attendance must be verified first.");
    let confirmed = 0;
    let firstFailure: ActionResult | null = null;
    for (const member of eligible) {
      const result = await confirmCompletionTx(tx, { sessionId: member.id, role: "ACADEMIC_MATE", now });
      if (result.ok) confirmed++; else firstFailure ??= result;
    }
    if (confirmed === 0) return firstFailure ?? fail(409, "Nothing could be confirmed.");
    await tx.sessionGroup.update({ where: { id: group.id }, data: { mateCompletionSubmittedAt: now, mateCompletionSubmittedByUserId: input.userId } });
    const skipped = members.filter((member) => !eligible.includes(member) && member.mateCompletionConfirmedAt === null && member.status !== "COMPLETED").length;
    return { ok: true as const, changed: true, skipped, message: `Completion confirmed for ${confirmed} ${confirmed === 1 ? "student" : "students"}.${skipped > 0 ? ` ${skipped} still ${skipped === 1 ? "needs" : "need"} attention.` : ""}` };
  }, { timeout: 30_000 });
}


// ---------------------------------------------------------------- venue
//
// The Academic Mate chooses where the session happens. A student can suggest a venue,
// which the mate accepts or declines. Every write is conditional on the session still
// being open and its arrangement still live, like the attendance and completion writes.

const DAY = new Intl.DateTimeFormat("en-ZM", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Lusaka" });
const isOpenSession = (record: SessionRecord) => (OPEN_STATUSES as readonly string[]).includes(record.status);
const venueClosedMessage = "This session has ended or been cancelled, so its venue can't be changed.";

/** Mate: set the venue for this slot (every student the mate teaches at the same time), optionally for future weekly sessions too. */
export async function setSessionVenue(input: { sessionId: string; userId: string; location: string; alsoFuture?: boolean }): Promise<ActionResult> {
  const checked = checkVenue(input.location);
  if (!checked.ok) return fail(400, checked.message);
  const location = checked.value;
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const record = await loadLocked(tx, input.sessionId);
    const role = record ? roleOf(record, input.userId) : null;
    if (!record || !role) return fail(404, "Session not found.");
    if (role !== "ACADEMIC_MATE") return fail(403, "Only the Academic Mate sets the venue. You can suggest one instead.");
    if (!isOpenSession(record)) return fail(409, venueClosedMessage);

    const offeringId = record.request.offeringId;
    const live = { status: "ACCEPTED" as const, arrangementStatus: { in: ["ACTIVE", "PAUSED"] as ("ACTIVE" | "PAUSED")[] }, offeringId };
    const slot = await tx.tutoringSession.findMany({
      where: { scheduledStart: record.scheduledStart, status: { in: [...OPEN_STATUSES] }, request: { is: live } },
      select: { id: true, meetingLocation: true, request: { select: { studentProfile: { select: { userId: true } } } } },
    });
    if (!slot.some((row) => row.id === record.id)) return fail(409, venueClosedMessage);
    if (slot.every((row) => row.meetingLocation === location)) return { ok: true, message: "That is already the venue.", changed: false };

    await tx.tutoringSession.updateMany({
      where: { id: { in: slot.map((row) => row.id) }, status: { in: [...OPEN_STATUSES] }, ...LIVE_ARRANGEMENT },
      data: { meetingLocation: location, suggestedLocation: null, suggestedLocationAt: null },
    });

    let futureCount = 0;
    if (input.alsoFuture && record.request.arrangementType === "RECURRING") {
      // Only touch later sessions still on the placeholder or on this session's old venue; a venue set on purpose stays.
      const future = await tx.tutoringSession.updateMany({
        where: {
          arrangementId: record.arrangementId,
          scheduledStart: { gt: record.scheduledStart },
          status: "SCHEDULED",
          meetingLocation: { in: [DEFAULT_MEETING_LOCATION, record.meetingLocation] },
          ...LIVE_ARRANGEMENT,
        },
        data: { meetingLocation: location },
      });
      futureCount = future.count;
    }

    const mateName = record.request.offering.academicMateProfile.user.name || "Your Academic Mate";
    const students = new Map(slot.map((row) => [row.id, row.request.studentProfile.userId]));
    await notifyOnce(tx, [...students].filter(([, userId]) => userId !== input.userId).map(([sessionId, userId]) => ({
      userId,
      dedupeKey: `venue:set:${sessionId}:${now.getTime()}`,
      title: "Meeting place set",
      body: `${mateName} set the venue for ${courseLabel(record)} on ${DAY.format(record.scheduledStart)}: ${location}${futureCount > 0 ? " (also for later weekly sessions)" : ""}.`,
      url: sessionUrl(sessionId),
      data: { sessionId },
    })));
    return { ok: true, changed: true, message: futureCount > 0 ? `Venue saved, including ${futureCount} later ${futureCount === 1 ? "session" : "sessions"}.` : slot.length > 1 ? `Venue saved for all ${slot.length} students in this slot.` : "Venue saved." };
  }, { timeout: 15_000 });
}

/** Student: propose a venue. The mate sees it and accepts or declines. */
export async function suggestSessionVenue(input: { sessionId: string; userId: string; location: string }): Promise<ActionResult> {
  const checked = checkVenue(input.location);
  if (!checked.ok) return fail(400, checked.message);
  const location = checked.value;
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const record = await loadLocked(tx, input.sessionId);
    const role = record ? roleOf(record, input.userId) : null;
    if (!record || !role) return fail(404, "Session not found.");
    if (role !== "STUDENT") return fail(403, "You are the Academic Mate, so you can set the venue directly.");
    if (!isOpenSession(record)) return fail(409, venueClosedMessage);
    if (record.meetingLocation.toLowerCase() === location.toLowerCase()) return { ok: true, message: "That is already the venue.", changed: false };
    if (record.suggestedLocation?.toLowerCase() === location.toLowerCase()) return { ok: true, message: "You already suggested this venue. Waiting for your Academic Mate.", changed: false };

    const claim = await tx.tutoringSession.updateMany({
      where: { id: record.id, status: { in: [...OPEN_STATUSES] }, ...LIVE_ARRANGEMENT },
      data: { suggestedLocation: location, suggestedLocationAt: now },
    });
    if (claim.count !== 1) return fail(409, venueClosedMessage);

    const mate = record.request.offering.academicMateProfile;
    await notifyOnce(tx, [{
      userId: mate.userId,
      dedupeKey: `venue:suggest:${record.id}:${now.getTime()}`,
      title: "A student suggested a meeting place",
      body: `${record.request.studentProfile.user.name || "A student"} suggests "${location}" for ${courseLabel(record)} on ${DAY.format(record.scheduledStart)}.`,
      url: urlFor(record, mate.userId),
      data: { sessionId: record.id },
    }]);
    return { ok: true, changed: true, message: "Suggestion sent. Your Academic Mate will accept it or choose another place." };
  }, { timeout: 15_000 });
}

/** Mate: accept or decline the student's suggestion. Accepting applies to that student's session only. */
export async function answerVenueSuggestion(input: { sessionId: string; userId: string; action: "ACCEPT" | "DECLINE" }): Promise<ActionResult> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const record = await loadLocked(tx, input.sessionId);
    const role = record ? roleOf(record, input.userId) : null;
    if (!record || !role) return fail(404, "Session not found.");
    if (role !== "ACADEMIC_MATE") return fail(403, "Only the Academic Mate can answer a venue suggestion.");
    if (!isOpenSession(record)) return fail(409, venueClosedMessage);
    const suggested = record.suggestedLocation;
    if (!suggested) return fail(409, "There is no suggestion to answer. It may have been withdrawn or already answered.");

    const accept = input.action === "ACCEPT";
    const claim = await tx.tutoringSession.updateMany({
      where: { id: record.id, suggestedLocation: suggested, status: { in: [...OPEN_STATUSES] }, ...LIVE_ARRANGEMENT },
      data: { ...(accept ? { meetingLocation: suggested } : {}), suggestedLocation: null, suggestedLocationAt: null },
    });
    if (claim.count !== 1) return fail(409, "This suggestion just changed. Please refresh and try again.");

    const student = record.request.studentProfile;
    const mateName = record.request.offering.academicMateProfile.user.name || "Your Academic Mate";
    await notifyOnce(tx, [{
      userId: student.userId,
      dedupeKey: `venue:${accept ? "accepted" : "declined"}:${record.id}:${now.getTime()}`,
      title: accept ? "Meeting place confirmed" : "Meeting place suggestion declined",
      body: accept
        ? `${mateName} accepted "${suggested}" for ${courseLabel(record)} on ${DAY.format(record.scheduledStart)}.`
        : `${mateName} can't meet at "${suggested}" for ${courseLabel(record)}. Check the session or chat for the venue.`,
      url: sessionUrl(record.id),
      data: { sessionId: record.id },
    }]);
    return { ok: true, changed: true, message: accept ? "Suggestion accepted. The venue is updated." : "Suggestion declined." };
  }, { timeout: 15_000 });
}
