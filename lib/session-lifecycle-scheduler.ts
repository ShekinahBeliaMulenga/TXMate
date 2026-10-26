import { expireStaleOneTimeArrangements } from "@/lib/arrangement-expiry";
import { prisma } from "@/lib/prisma";
import { groupUrl, notifyOnce, sessionUrl } from "@/lib/notify";
import {
  attendanceOutcome,
  COMPLETION_DEADLINE_MS,
  HOUR_MS,
  MATE_ATTENDANCE_LEAD_MS,
  STUDENT_ATTENDANCE_DELAY_MS,
} from "@/lib/session-lifecycle-rules";
import { SESSION_SELECT } from "@/lib/session-lifecycle-serialize";
import { attachSessionsToGroups, flagOverdueCompletion, recordSnapshot } from "@/lib/session-lifecycle-service";

const MAX_SESSIONS_PER_RUN = 200;
const GROUPING_HORIZON_MS = 7 * 24 * HOUR_MS;
/** One reminder, this long before the second-confirmation deadline. */
const REMINDER_LEAD_MS = 2 * HOUR_MS;

export type SessionLifecycleSummary = {
  sessionsStarted: number;
  attendancePromptsSent: number;
  completionPromptsSent: number;
  sessionsFlaggedForReview: number;
  arrangementsCompleted: number;
  arrangementsExpired: number;
  failed: number;
};

async function closeExpiredRecurringArrangements(now: Date): Promise<{ completed: number; failed: number }> {
  let completed = 0;
  let failed = 0;
  let candidates: { id: string }[];
  try {
    candidates = await prisma.mateRequest.findMany({
      where: { status: "ACCEPTED", arrangementType: "RECURRING", arrangementStatus: { in: ["ACTIVE", "PAUSED"] }, recurrenceEndsAt: { lte: now } },
      orderBy: [{ recurrenceEndsAt: "asc" }, { id: "asc" }],
      take: MAX_SESSIONS_PER_RUN,
      select: { id: true },
    });
  } catch (error) {
    console.error("Failed to find expired recurring arrangements:", error);
    return { completed, failed: 1 };
  }
  for (const candidate of candidates) {
    try {
      const didComplete = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`arrangement:${candidate.id}`}, 0))`;
        const arrangement = await tx.mateRequest.findUnique({
          where: { id: candidate.id },
          select: { status: true, arrangementType: true, arrangementStatus: true, recurrenceEndsAt: true },
        });
        if (!arrangement || arrangement.status !== "ACCEPTED" || arrangement.arrangementType !== "RECURRING" || !["ACTIVE", "PAUSED"].includes(arrangement.arrangementStatus) || !arrangement.recurrenceEndsAt || arrangement.recurrenceEndsAt > now) return false;
        const unresolved = await tx.tutoringSession.count({ where: { arrangementId: candidate.id, status: { in: ["SCHEDULED", "IN_PROGRESS", "DISPUTED"] } } });
        if (unresolved !== 0) return false;
        const result = await tx.mateRequest.updateMany({
          where: { id: candidate.id, status: "ACCEPTED", arrangementType: "RECURRING", arrangementStatus: { in: ["ACTIVE", "PAUSED"] }, recurrenceEndsAt: { lte: now } },
          data: { arrangementStatus: "COMPLETED" },
        });
        return result.count === 1;
      });
      if (didComplete) completed++;
    } catch (error) {
      failed++;
      console.error(`Failed to close recurring arrangement ${candidate.id}:`, error);
    }
  }
  return { completed, failed };
}

export async function processSessionLifecycle(now = new Date()): Promise<SessionLifecycleSummary> {
  const summary: SessionLifecycleSummary = {
    sessionsStarted: 0,
    attendancePromptsSent: 0,
    completionPromptsSent: 0,
    sessionsFlaggedForReview: 0,
    arrangementsCompleted: 0,
    arrangementsExpired: 0,
    failed: 0,
  };
  const nowMs = now.getTime();

  // 1. A session starts when its scheduled start arrives. Only SCHEDULED sessions of an
  //    active arrangement move: cancelled, completed and disputed sessions are never touched.
  const started = await prisma.tutoringSession.updateMany({
    where: { status: "SCHEDULED", scheduledStart: { lte: now }, request: { is: { status: "ACCEPTED", arrangementStatus: "ACTIVE" } } },
    data: { status: "IN_PROGRESS" },
  });
  summary.sessionsStarted += started.count;

  // 2. Bundle upcoming sessions of the same Academic Mate slot (and repair rescheduled ones).
  try {
    const stale = await prisma.$queryRaw<{ id: string }[]>`
      SELECT s."id" FROM "TutoringSession" s
      LEFT JOIN "SessionGroup" g ON g."id" = s."groupId"
      WHERE s."status" IN ('SCHEDULED', 'IN_PROGRESS')
        AND s."scheduledStart" <= ${new Date(nowMs + GROUPING_HORIZON_MS)}
        AND (s."groupId" IS NULL OR g."scheduledStart" <> s."scheduledStart" OR g."scheduledEnd" <> s."scheduledEnd")
      LIMIT 500`;
    if (stale.length > 0) {
      const rows = await prisma.tutoringSession.findMany({
        where: { id: { in: stale.map((row) => row.id) } },
        select: { id: true, groupId: true, scheduledStart: true, scheduledEnd: true, group: { select: { scheduledStart: true, scheduledEnd: true } }, request: { select: { offeringId: true } } },
      });
      await attachSessionsToGroups(prisma, rows.map((row) => ({ id: row.id, offeringId: row.request.offeringId, scheduledStart: row.scheduledStart, scheduledEnd: row.scheduledEnd, groupId: row.groupId, group: row.group })));
    }
  } catch (error) {
    summary.failed++;
    console.error("Grouping sessions failed:", error);
  }

  // 3. Prompts. Students are prompted per session; the Academic Mate once per group.
  const candidates = await prisma.tutoringSession.findMany({
    where: {
      status: "IN_PROGRESS",
      scheduledStart: { lte: now },
      completionReviewRequiredAt: null,
      completionDisputedAt: null,
      request: { is: { status: "ACCEPTED", arrangementStatus: { in: ["ACTIVE", "PAUSED"] } } },
      // Only sessions with a prompt that is due AND still unsent AND still unanswered. Anything
      // else would be re-selected on every run and could crowd newer sessions out of the batch.
      OR: [
        { scheduledStart: { lte: new Date(nowMs - STUDENT_ATTENDANCE_DELAY_MS) }, OR: [{ attendance: { is: null } }, { attendance: { is: { studentAttendancePromptSentAt: null, studentAttended: null, status: { not: "DISPUTED" } } } }] },
        // The mate is asked once a student has answered: the student answers first.
        { scheduledEnd: { lte: new Date(nowMs + MATE_ATTENDANCE_LEAD_MS) }, attendance: { is: { mateAttendancePromptSentAt: null, mateConfirmedStudentAttended: null, studentAttended: { not: null }, status: { not: "DISPUTED" } } } },
        { scheduledEnd: { lte: now }, completionPromptSentAt: null, attendance: { is: { status: "CONFIRMED", studentAttended: true, mateConfirmedStudentAttended: true } } },
      ],
    },
    orderBy: [{ scheduledStart: "asc" }, { id: "asc" }],
    take: MAX_SESSIONS_PER_RUN,
    select: { id: true },
  });

  for (const candidate of candidates) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "TutoringSession" WHERE "id" = ${candidate.id} FOR UPDATE`;
        const session = await tx.tutoringSession.findUnique({ where: { id: candidate.id }, select: SESSION_SELECT });
        if (!session || session.status !== "IN_PROGRESS" || session.completionDisputedAt || session.completionReviewRequiredAt) return;
        if (session.request.status !== "ACCEPTED" || !["ACTIVE", "PAUSED"].includes(session.request.arrangementStatus)) return;
        await tx.attendance.createMany({ data: [{ sessionId: session.id }], skipDuplicates: true });
        const attendance = await tx.attendance.findUnique({ where: { sessionId: session.id } });
        if (!attendance || attendance.status === "DISPUTED") return;

        const studentUser = session.request.studentProfile.userId;
        const mateUser = session.request.offering.academicMateProfile.userId;
        const mateName = session.request.offering.academicMateProfile.user.name || "your Academic Mate";
        const course = `${session.request.offering.course.code} · ${session.request.offering.course.name}`;
        const start = session.scheduledStart.getTime();
        const end = session.scheduledEnd.getTime();
        const mateUrl = session.groupId ? groupUrl(session.groupId) : sessionUrl(session.id);
        const groupSize = session.groupId
          ? await tx.tutoringSession.count({ where: { groupId: session.groupId, scheduledStart: session.scheduledStart, scheduledEnd: session.scheduledEnd, status: { in: ["SCHEDULED", "IN_PROGRESS", "DISPUTED"] }, request: { is: { status: "ACCEPTED" } } } })
          : 1;
        const students = `${groupSize} ${groupSize === 1 ? "student" : "students"}`;

        // Student attendance: 20 minutes after the start.
        if (start + STUDENT_ATTENDANCE_DELAY_MS <= nowMs && attendance.studentAttendancePromptSentAt === null && attendance.studentAttended === null) {
          const claim = await tx.attendance.updateMany({ where: { sessionId: session.id, studentAttendancePromptSentAt: null }, data: { studentAttendancePromptSentAt: now } });
          if (claim.count === 1) {
            summary.attendancePromptsSent += await notifyOnce(tx, [{
              userId: studentUser, dedupeKey: `att:student:${session.id}`,
              title: "Did you attend your session?", body: `${course} with ${mateName}. One tap to confirm.`,
              url: sessionUrl(session.id), data: { sessionId: session.id, event: "STUDENT_ATTENDANCE_PROMPT" },
            }]);
          }
        }
        // Academic Mate attendance: once per group, from 10 minutes before the end (never before the start).
        if (Math.max(start, end - MATE_ATTENDANCE_LEAD_MS) <= nowMs && attendance.mateAttendancePromptSentAt === null && attendance.mateConfirmedStudentAttended === null && attendance.studentAttended !== null) {
          const claim = await tx.attendance.updateMany({ where: { sessionId: session.id, mateAttendancePromptSentAt: null }, data: { mateAttendancePromptSentAt: now } });
          if (claim.count === 1) {
            const key = session.groupId ? `att:mate:group:${session.groupId}` : `att:mate:${session.id}`;
            const created = await notifyOnce(tx, [{
              userId: mateUser, dedupeKey: key,
              title: `Confirm attendance: ${session.request.offering.course.code}`, body: `${students}. Review the list and confirm once.`,
              url: mateUrl, data: { sessionId: session.id, groupId: session.groupId, event: "MATE_ATTENDANCE_PROMPT" },
            }]);
            summary.attendancePromptsSent += created;
            if (session.groupId && created > 0) await tx.sessionGroup.updateMany({ where: { id: session.groupId, mateAttendancePromptSentAt: null }, data: { mateAttendancePromptSentAt: now } });
          }
        }
        // Completion: only after the end AND verified attendance.
        const verified = attendanceOutcome(recordSnapshot(session)) === "VERIFIED";
        if (end <= nowMs && verified && session.completionPromptSentAt === null) {
          const claim = await tx.tutoringSession.updateMany({ where: { id: session.id, status: "IN_PROGRESS", completionPromptSentAt: null, completionDisputedAt: null, completionReviewRequiredAt: null }, data: { completionPromptSentAt: now } });
          if (claim.count === 1) {
            const created = await notifyOnce(tx, [
              {
                userId: studentUser, dedupeKey: `completion:student:${session.id}`,
                title: "Was your session completed?", body: `${course} with ${mateName}. Confirm it went ahead as planned.`,
                url: sessionUrl(session.id), data: { sessionId: session.id, event: "STUDENT_COMPLETION_PROMPT" },
              },
              {
                userId: mateUser, dedupeKey: session.groupId ? `completion:mate:group:${session.groupId}` : `completion:mate:${session.id}`,
                title: `Confirm completion: ${session.request.offering.course.code}`, body: `${students} attended. One tap confirms the whole group.`,
                url: mateUrl, data: { sessionId: session.id, groupId: session.groupId, event: "MATE_COMPLETION_PROMPT" },
              },
            ]);
            summary.completionPromptsSent += created;
          }
        }
      }, { timeout: 15_000 });
    } catch (error) {
      summary.failed++;
      console.error(`Session lifecycle processing failed for ${candidate.id}:`, error);
    }
  }

  // 4. One reminder before the 12-hour deadline, to whoever has not confirmed yet.
  const reminderFrom = new Date(nowMs - COMPLETION_DEADLINE_MS + 1);
  const reminderUntil = new Date(nowMs - COMPLETION_DEADLINE_MS + REMINDER_LEAD_MS);
  const reminders = await prisma.tutoringSession.findMany({
    where: {
      status: "IN_PROGRESS", completionReviewRequiredAt: null, completionDisputedAt: null,
      OR: [
        { studentCompletionConfirmedAt: { gte: reminderFrom, lte: reminderUntil }, mateCompletionConfirmedAt: null },
        { mateCompletionConfirmedAt: { gte: reminderFrom, lte: reminderUntil }, studentCompletionConfirmedAt: null },
      ],
      request: { is: { status: "ACCEPTED", arrangementStatus: { in: ["ACTIVE", "PAUSED"] } } },
    },
    take: MAX_SESSIONS_PER_RUN,
    select: SESSION_SELECT,
  });
  for (const session of reminders) {
    try {
      const waitingOnStudent = session.studentCompletionConfirmedAt === null;
      const userId = waitingOnStudent ? session.request.studentProfile.userId : session.request.offering.academicMateProfile.userId;
      const code = session.request.offering.course.code;
      const forMateGroup = !waitingOnStudent && session.groupId;
      await notifyOnce(prisma, [{
        userId, dedupeKey: forMateGroup ? `completion:reminder:group:${session.groupId}` : `completion:reminder:${session.id}:${userId}`,
        title: "Confirmation due soon", body: `${code}: confirm within 2 hours or the session goes to review.`,
        url: forMateGroup && session.groupId ? groupUrl(session.groupId) : sessionUrl(session.id),
        data: { sessionId: session.id, event: "COMPLETION_REMINDER" },
      }]);
    } catch (error) {
      summary.failed++;
      console.error(`Completion reminder failed for ${session.id}:`, error);
    }
  }

  // 5. Second confirmation overdue: flag for review. Never auto-complete.
  const deadline = new Date(nowMs - COMPLETION_DEADLINE_MS);
  const overdue = await prisma.tutoringSession.findMany({
    where: {
      status: "IN_PROGRESS", completionReviewRequiredAt: null, completionDisputedAt: null,
      OR: [
        { studentCompletionConfirmedAt: { lte: deadline }, mateCompletionConfirmedAt: null },
        { mateCompletionConfirmedAt: { lte: deadline }, studentCompletionConfirmedAt: null },
      ],
      request: { is: { status: "ACCEPTED", arrangementStatus: { in: ["ACTIVE", "PAUSED"] } } },
    },
    orderBy: [{ scheduledEnd: "asc" }, { id: "asc" }],
    take: MAX_SESSIONS_PER_RUN,
    select: { id: true },
  });
  for (const item of overdue) {
    try {
      const flagged = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "TutoringSession" WHERE "id" = ${item.id} FOR UPDATE`;
        const session = await tx.tutoringSession.findUnique({ where: { id: item.id }, select: SESSION_SELECT });
        return session ? flagOverdueCompletion(tx, session, now) : false;
      }, { timeout: 15_000 });
      if (flagged) summary.sessionsFlaggedForReview++;
    } catch (error) {
      summary.failed++;
      console.error(`Session completion deadline processing failed for ${item.id}:`, error);
    }
  }

  const closedArrangements = await closeExpiredRecurringArrangements(now);
  summary.arrangementsCompleted += closedArrangements.completed;
  summary.failed += closedArrangements.failed;

  // One-time arrangements nobody answered for 24h are closed so they stop blocking new requests.
  try {
    summary.arrangementsExpired += await expireStaleOneTimeArrangements(prisma, now);
  } catch (error) {
    summary.failed++;
    console.error("Expiring unanswered one-time arrangements failed:", error);
  }
  return summary;
}
