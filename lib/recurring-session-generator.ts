import { prisma } from "@/lib/prisma";
import { RECURRING_GENERATION_HORIZON_DAYS, getRecurringOccurrenceStarts, type RecurringArrangementPlan } from "@/lib/recurring-arrangements";
import { hasScheduleConflict } from "@/lib/recurring-arrangement-conflicts";

const DAY_MS = 24 * 60 * 60 * 1000;

export type RecurringGenerationSummary = {
  arrangementsChecked: number;
  sessionsCreated: number;
  conflicts: number;
  failed: number;
};

type GenerationResult = "created" | "exists" | "inactive" | "conflict" | "invalid";

async function generateOneOccurrence(
  arrangementId: string,
  scheduledStart: Date,
): Promise<GenerationResult> {
  return prisma.$transaction(async (tx) => {
    const arrangement = await tx.mateRequest.findUnique({
      where: { id: arrangementId },
      select: {
        id: true,
        status: true,
        arrangementType: true,
        arrangementStatus: true,
        studentProfileId: true,
        requestedStart: true,
        recurrenceEveryWeeks: true,
        recurrenceWeekday: true,
        recurrenceLocalStartMinute: true,
        recurrenceTimezone: true,
        recurrenceEndsAt: true,
        studentProfile: {
          select: { userId: true, status: true, user: { select: { name: true } } },
        },
        offering: {
          select: {
            title: true,
            sessionDurationMinutes: true,
            course: { select: { code: true, name: true } },
            academicMateProfile: {
              select: { id: true, userId: true, status: true, verificationStatus: true, user: { select: { name: true } } },
            },
          },
        },
        tutoringSession: { select: { id: true } },
      },
    });

    if (
      !arrangement ||
      arrangement.status !== "ACCEPTED" ||
      arrangement.arrangementStatus !== "ACTIVE" ||
      arrangement.arrangementType !== "RECURRING" ||
      !arrangement.requestedStart ||
      arrangement.studentProfile.status !== "ACTIVE" ||
      arrangement.offering.academicMateProfile.status !== "ACTIVE" ||
      arrangement.offering.academicMateProfile.verificationStatus !== "VERIFIED"
    ) {
      return "inactive";
    }

    const plan: RecurringArrangementPlan = {
      anchorStart: arrangement.requestedStart,
      everyWeeks: arrangement.recurrenceEveryWeeks,
      weekday: arrangement.recurrenceWeekday,
      localStartMinute: arrangement.recurrenceLocalStartMinute,
      timezone: arrangement.recurrenceTimezone,
      endsAt: arrangement.recurrenceEndsAt,
    };
    const verifiedStarts = getRecurringOccurrenceStarts(
      plan,
      scheduledStart,
      scheduledStart,
      true,
    );
    if (!verifiedStarts?.some((start) => start.getTime() === scheduledStart.getTime())) {
      return "invalid";
    }

    const existing = await tx.tutoringSession.findUnique({
      where: {
        arrangementId_occurrenceSlotStart: {
          arrangementId: arrangement.id,
          occurrenceSlotStart: scheduledStart,
        },
      },
      select: { id: true },
    });
    if (existing) return "exists";

    const lockKeys = [
      `student:${arrangement.studentProfileId}`,
      `academic-mate:${arrangement.offering.academicMateProfile.id}`,
    ].sort();
    for (const lockKey of lockKeys) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    }

    const latestArrangement = await tx.mateRequest.findUnique({
      where: { id: arrangement.id },
      select: { status: true, arrangementType: true, arrangementStatus: true },
    });
    if (
      !latestArrangement ||
      latestArrangement.status !== "ACCEPTED" ||
      latestArrangement.arrangementType !== "RECURRING" ||
      latestArrangement.arrangementStatus !== "ACTIVE"
    ) {
      return "inactive";
    }

    // Re-read the existence check after acquiring locks to make concurrent cron
    // invocations idempotent, in addition to the database unique constraint.
    const duplicate = await tx.tutoringSession.findUnique({
      where: {
        arrangementId_occurrenceSlotStart: {
          arrangementId: arrangement.id,
          occurrenceSlotStart: scheduledStart,
        },
      },
      select: { id: true },
    });
    if (duplicate) return "exists";

    const duration = arrangement.offering.sessionDurationMinutes;
    const conflict = await hasScheduleConflict(tx, {
      occurrenceStarts: [scheduledStart],
      durationMinutes: duration,
      studentProfileId: arrangement.studentProfileId,
      academicMateProfileId: arrangement.offering.academicMateProfile.id,
      excludeRequestId: arrangement.id,
    });

    const scheduledEnd = new Date(scheduledStart.getTime() + duration * 60_000);
    if (conflict) {
      const timezone = arrangement.recurrenceTimezone ?? "Africa/Lusaka";
      let localLabel: string;
      try {
        localLabel = new Intl.DateTimeFormat("en-ZM", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
          timeZone: timezone,
        }).format(scheduledStart);
      } catch {
        localLabel = scheduledStart.toISOString();
      }

      const courseCode = arrangement.offering.course.code;
      const courseName = arrangement.offering.course.name;
      const studentName = arrangement.studentProfile.user.name || "the student";
      const mateName = arrangement.offering.academicMateProfile.user.name || "the Academic Mate";
      const conversationUrl = arrangement.tutoringSession?.id
        ? `/student/sessions/${encodeURIComponent(arrangement.tutoringSession.id)}/conversation`
        : "/student/messages";
      const title = `Scheduling conflict for ${courseCode}`;
      const users = [
        { userId: arrangement.studentProfile.userId, otherName: mateName },
        { userId: arrangement.offering.academicMateProfile.userId, otherName: studentName },
      ];
      for (const { userId, otherName } of users) {
        const body = `Your ${courseCode} · ${courseName} session with ${otherName}, planned for ${localLabel} (${timezone}), could not be scheduled because it conflicts with another session or pending request. Please agree on another time in TXMate.`;
        const priorNotice = await tx.notification.findFirst({
          where: { userId, title, body },
          select: { id: true },
        });
        if (!priorNotice) {
          await tx.notification.create({
            data: {
              userId,
              type: "SYSTEM",
              title,
              body,
              data: {
                arrangementId: arrangement.id,
                recurrenceStart: scheduledStart.toISOString(),
                courseCode,
                courseName,
                otherParticipantName: otherName,
                url: conversationUrl,
                conversationUrl,
              },
            },
          });
        }
      }
      return "conflict";
    }

    const createdSession = await tx.tutoringSession.create({
      data: {
        arrangementId: arrangement.id,
        scheduledStart,
        scheduledEnd,
        occurrenceSlotStart: scheduledStart,
        meetingLocation: "To be agreed in conversation",
        status: "SCHEDULED",
      },
      select: { id: true },
    });

    const studentName = arrangement.studentProfile.user.name || "your student";
    const mateName = arrangement.offering.academicMateProfile.user.name || "your Academic Mate";
    const courseCode = arrangement.offering.course.code;
    const courseName = arrangement.offering.course.name;
    const conversationUrl = `/student/sessions/${encodeURIComponent(createdSession.id)}/conversation`;
    const notificationData = {
      requestId: arrangement.id,
      arrangementId: arrangement.id,
      sessionId: createdSession.id,
      scheduledStart: scheduledStart.toISOString(),
      scheduledEnd: scheduledEnd.toISOString(),
      courseCode,
      courseName,
      studentName,
      academicMateName: mateName,
      conversationUrl,
      url: conversationUrl,
    };
    const timezone = arrangement.recurrenceTimezone ?? "Africa/Lusaka";
    let localLabel: string;
    try {
      localLabel = new Intl.DateTimeFormat("en-ZM", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: timezone,
      }).format(scheduledStart);
    } catch {
      localLabel = scheduledStart.toISOString();
    }
    await tx.notification.createMany({
      data: [
        {
          userId: arrangement.studentProfile.userId,
          type: "SESSION_SCHEDULED",
          title: `Session with ${mateName} scheduled`,
          body: `Your ${courseCode} · ${courseName} session with ${mateName} is scheduled for ${localLabel} (${timezone}).`,
          data: notificationData,
        },
        {
          userId: arrangement.offering.academicMateProfile.userId,
          type: "SESSION_SCHEDULED",
          title: `Session with ${studentName} scheduled`,
          body: `Your ${courseCode} · ${courseName} session with ${studentName} is scheduled for ${localLabel} (${timezone}).`,
          data: notificationData,
        },
      ],
    });

    return "created";
  }, { maxWait: 5_000, timeout: 15_000 });
}

export async function ensureRecurringSessions(now = new Date()): Promise<RecurringGenerationSummary> {
  const horizonEnd = new Date(now.getTime() + RECURRING_GENERATION_HORIZON_DAYS * DAY_MS);
  const arrangements = await prisma.mateRequest.findMany({
    where: {
      status: "ACCEPTED",
      arrangementStatus: "ACTIVE",
      arrangementType: "RECURRING",
      initialSessionId: { not: null },
      requestedStart: { lt: horizonEnd },
      OR: [
        { recurrenceEndsAt: null },
        { recurrenceEndsAt: { gte: now } },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      requestedStart: true,
      recurrenceEveryWeeks: true,
      recurrenceWeekday: true,
      recurrenceLocalStartMinute: true,
      recurrenceTimezone: true,
      recurrenceEndsAt: true,
    },
  });

  const summary: RecurringGenerationSummary = {
    arrangementsChecked: arrangements.length,
    sessionsCreated: 0,
    conflicts: 0,
    failed: 0,
  };

  for (const arrangement of arrangements) {
    if (
      !arrangement.requestedStart ||
      arrangement.recurrenceEveryWeeks === null ||
      arrangement.recurrenceWeekday === null ||
      arrangement.recurrenceLocalStartMinute === null ||
      !arrangement.recurrenceTimezone
    ) {
      summary.failed++;
      console.error(`Recurring arrangement ${arrangement.id} has incomplete recurrence settings.`);
      continue;
    }

    const plan: RecurringArrangementPlan = {
      anchorStart: arrangement.requestedStart,
      everyWeeks: arrangement.recurrenceEveryWeeks,
      weekday: arrangement.recurrenceWeekday,
      localStartMinute: arrangement.recurrenceLocalStartMinute,
      timezone: arrangement.recurrenceTimezone,
      endsAt: arrangement.recurrenceEndsAt,
    };
    const starts = getRecurringOccurrenceStarts(plan, now, horizonEnd, false);
    if (starts === null) {
      summary.failed++;
      console.error(`Recurring arrangement ${arrangement.id} has an invalid recurrence schedule.`);
      continue;
    }

    for (const start of starts) {
      try {
        const result = await generateOneOccurrence(arrangement.id, start);
        if (result === "created") summary.sessionsCreated++;
        else if (result === "conflict") summary.conflicts++;
        else if (result === "invalid") summary.failed++;
      } catch (error) {
        summary.failed++;
        console.error(`Failed to generate recurring session for arrangement ${arrangement.id}:`, error);
      }
    }
  }

  return summary;
}
