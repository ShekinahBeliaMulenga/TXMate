import { removeStaleUnverifiedAccounts } from "@/lib/account-cleanup";
import { prisma } from "@/lib/prisma";
import { ensureRecurringSessions } from "@/lib/recurring-session-generator";
import { expirePendingRescheduleProposals } from "@/lib/reschedule-proposal-expiry";
import { processSessionLifecycle } from "@/lib/session-lifecycle-scheduler";
import { attachSessionsToGroups } from "@/lib/session-lifecycle-service";

const REMINDER_WINDOW_MS = 5 * 60 * 1000;
const MAX_LATE_MS = 2 * 60 * 1000;
const MAX_SESSIONS_PER_RUN = 100;

export async function runScheduledJobs(now = new Date(), options: { includeHeavy?: boolean } = {}) {
  // Reminders and prompts are time-critical; the broader scans below need not run every few seconds.
  const includeHeavy = options.includeHeavy ?? true;
  let rescheduleProposalExpiry = {
    checked: 0,
    expired: 0,
    failed: 0,
    hasMore: false,
  };
  try {
    if (includeHeavy) rescheduleProposalExpiry = await expirePendingRescheduleProposals(now);
  } catch (error) {
    rescheduleProposalExpiry.failed++;
    console.error("Rescheduling-proposal expiry failed:", error);
  }

  let recurringGeneration = {
    arrangementsChecked: 0,
    sessionsCreated: 0,
    conflicts: 0,
    failed: 0,
  };
  try {
    if (includeHeavy) recurringGeneration = await ensureRecurringSessions(now);
  } catch (error) {
    recurringGeneration.failed++;
    console.error("Recurring-session generation failed:", error);
  }

  let accountCleanup = { deleted: 0, failed: 0 };
  try {
    if (includeHeavy) accountCleanup = await removeStaleUnverifiedAccounts(now);
  } catch (error) {
    accountCleanup.failed++;
    console.error("Unverified account cleanup failed:", error);
  }

  const reminderDeadline = new Date(now.getTime() + REMINDER_WINDOW_MS);
  const earliestStart = new Date(now.getTime() - MAX_LATE_MS);

  try {
    const sessions = await prisma.tutoringSession.findMany({
      where: {
        status: "SCHEDULED",
        reminderSentAt: null,
        scheduledStart: {
          gte: earliestStart,
          lte: reminderDeadline,
        },
        scheduledEnd: { gt: now },
      },
      orderBy: { scheduledStart: "asc" },
      take: MAX_SESSIONS_PER_RUN,
      select: {
        id: true,
        groupId: true,
        group: { select: { scheduledStart: true, scheduledEnd: true } },
        scheduledStart: true,
        scheduledEnd: true,
        request: {
          select: {
            offeringId: true,
            status: true,
            arrangementStatus: true,
            studentProfile: {
              select: {
                userId: true,
                user: { select: { name: true } },
              },
            },
            recurrenceTimezone: true,
            offering: {
              select: {
                course: { select: { code: true, name: true } },
                academicMateProfile: { select: { userId: true, user: { select: { name: true } } } },
              },
            },
          },
        },
      },
    });

    let remindersSent = 0;
    let skipped = 0;
    let failed = 0;

    // Group before reminding, so the Academic Mate gets one reminder per slot and the link
    // opens the right sheet even if a session was just rescheduled.
    let groupIds = new Map<string, string>();
    try {
      groupIds = await attachSessionsToGroups(prisma, sessions.map((s) => ({ id: s.id, offeringId: s.request.offeringId, scheduledStart: s.scheduledStart, scheduledEnd: s.scheduledEnd, groupId: s.groupId, group: s.group })));
    } catch (error) {
      console.error("Grouping sessions before reminders failed:", error);
    }

    for (const session of sessions) {
      if (session.request.status !== "ACCEPTED" || session.request.arrangementStatus !== "ACTIVE") {
        skipped++;
        continue;
      }

      const studentId = session.request.studentProfile.userId;
      const studentName = session.request.studentProfile.user.name || "the student";
      const mateId = session.request.offering.academicMateProfile.userId;
      const mateName = session.request.offering.academicMateProfile.user.name || "the Academic Mate";
      const course = session.request.offering.course;
      const courseName = `${course.code} · ${course.name}`;
      const timezone = session.request.recurrenceTimezone || "Africa/Lusaka";
      let scheduledTimeLabel: string;
      try {
        scheduledTimeLabel = new Intl.DateTimeFormat("en-ZM", {
          timeZone: timezone, weekday: "short", day: "numeric", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit", hourCycle: "h23",
        }).format(session.scheduledStart);
      } catch {
        scheduledTimeLabel = session.scheduledStart.toISOString();
      }

      try {
        const sent = await prisma.$transaction(async (tx) => {
          const claimNow = new Date();
          const claimDeadline = new Date(
            claimNow.getTime() + REMINDER_WINDOW_MS,
          );
          const claimEarliestStart = new Date(
            claimNow.getTime() - MAX_LATE_MS,
          );

          const claim = await tx.tutoringSession.updateMany({
            where: {
              id: session.id,
              request: {
                is: {
                  status: "ACCEPTED",
                  arrangementStatus: "ACTIVE",
                },
              },
              status: "SCHEDULED",
              reminderSentAt: null,
              scheduledStart: {
                gte: claimEarliestStart,
                lte: claimDeadline,
              },
              scheduledEnd: { gt: claimNow },
            },
            data: { reminderSentAt: claimNow },
          });

          if (claim.count !== 1) return false;

          const minutesUntilStart = Math.ceil(
            (session.scheduledStart.getTime() - claimNow.getTime()) / 60_000,
          );

          const timingMessage =
            minutesUntilStart <= 0
              ? "Your session is starting now or has just started."
              : `Your session starts in about ${minutesUntilStart} minute${minutesUntilStart === 1 ? "" : "s"}.`;

          const conversationUrl = `/student/sessions/${encodeURIComponent(session.id)}/conversation`;
          const notificationData = {
            sessionId: session.id,
            scheduledStart: session.scheduledStart.toISOString(),
            scheduledEnd: session.scheduledEnd.toISOString(),
            courseCode: course.code,
            courseName: course.name,
            studentName,
            academicMateName: mateName,
            timezone,
            conversationUrl,
            url: conversationUrl,
          };
          // Students get their own reminder; the Academic Mate gets one per group, not one per student.
          const groupId = groupIds.get(session.id) ?? null;
          const sessionLink = `/student/sessions/${encodeURIComponent(session.id)}`;
          const mateLink = groupId ? `/student/sessions/group/${encodeURIComponent(groupId)}` : sessionLink;
          const groupSize = groupId
            ? await tx.tutoringSession.count({ where: { groupId, scheduledStart: session.scheduledStart, scheduledEnd: session.scheduledEnd, status: "SCHEDULED", request: { is: { status: "ACCEPTED", arrangementStatus: "ACTIVE" } } } })
            : 1;
          const mateTitle = groupSize > 1 ? `${course.code} starts soon · ${groupSize} students` : `Session with ${studentName} starts soon`;
          const mateBody = groupSize > 1
            ? `${timingMessage} Your ${courseName} session with ${groupSize} students is scheduled for ${scheduledTimeLabel} (${timezone}).`
            : `${timingMessage} Your ${courseName} session with ${studentName} is scheduled for ${scheduledTimeLabel} (${timezone}).`;
          await tx.notification.createMany({
            data: [
              {
                userId: studentId,
                type: "SESSION_REMINDER",
                dedupeKey: `reminder:${session.id}:${studentId}`,
                title: `Session with ${mateName} starts soon`,
                body: `${timingMessage} Your ${courseName} session with ${mateName} is scheduled for ${scheduledTimeLabel} (${timezone}).`,
                data: { ...notificationData, url: sessionLink },
              },
              {
                userId: mateId,
                type: "SESSION_REMINDER",
                dedupeKey: groupId ? `reminder:group:${groupId}:${session.scheduledStart.getTime()}` : `reminder:${session.id}:${mateId}`,
                title: mateTitle,
                body: mateBody,
                data: { ...notificationData, url: mateLink },
              },
            ],
            skipDuplicates: true,
          });

          return true;
        });

        if (sent) remindersSent++;
        else skipped++;
      } catch (error) {
        failed++;
        console.error(
          `Failed to create reminder for session ${session.id}:`,
          error,
        );
      }
    }

    let sessionLifecycle = {
      sessionsStarted: 0,
      attendancePromptsSent: 0,
      completionPromptsSent: 0,
      sessionsFlaggedForReview: 0,
      arrangementsCompleted: 0,
      arrangementsExpired: 0,
      failed: 0,
    };
    try {
      sessionLifecycle = await processSessionLifecycle(now);
    } catch (error) {
      sessionLifecycle.failed++;
      console.error("Session lifecycle processing failed:", error);
    }

    return {
      ok: true,
      checked: sessions.length,
      remindersSent,
      skipped,
      failed,
      recurringGeneration,
      rescheduleProposalExpiry,
      sessionLifecycle,
      accountCleanup,
      processedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Session reminder scheduler failed:", error);
    // Attempt the independently idempotent lifecycle jobs even if the ordinary
    // reminder scan fails. A retry is safe because each action is claimed in DB.
    try {
      const lifecycleRetry = await processSessionLifecycle(new Date());
      console.error("Session lifecycle fallback completed:", lifecycleRetry);
    } catch (lifecycleError) {
      console.error("Session lifecycle fallback failed:", lifecycleError);
    }
    throw error;
  }
}
