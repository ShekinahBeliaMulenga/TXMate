import {
  ACTIVE_SESSION_STATUSES,
} from "@/lib/academic-mate-availability";
import {
  getRecurringOccurrencesOverlappingRange,
  type RecurringArrangementPlan,
} from "@/lib/recurring-arrangements";

type PrismaClientInstance = typeof import("@/lib/prisma").prisma;
type TransactionClient = Parameters<
  Parameters<PrismaClientInstance["$transaction"]>[0]
>[0];

export type ScheduleConflictInput = {
  occurrenceStarts: Date[];
  durationMinutes: number;
  studentProfileId: string;
  academicMateProfileId: string;
  excludeRequestId?: string;
  excludeSessionId?: string;
  /** Include the excluded arrangement's future recurrence during rescheduling. */
  includeExcludedRequestRecurrence?: boolean;
  /** The recurrence slot identity belonging to the session currently being moved. */
  ignoreOccurrenceSlotStart?: Date;
};

/**
 * Returns candidate start timestamps that conflict with this student's own
 * sessions, pending requests, or live recurring arrangements. Other students'
 * bookings with the same Academic Mate intentionally do not conflict.
 *
 * This read-only variant is suitable for displaying candidate slots. A caller
 * that is making a booking decision must call it inside a transaction after
 * acquiring the student/Academic Mate advisory locks.
 */
export async function getScheduleConflictingStarts(
  db: TransactionClient,
  input: ScheduleConflictInput,
): Promise<Set<number>> {
  const invalidInput =
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes <= 0 ||
    input.occurrenceStarts.length === 0 ||
    input.occurrenceStarts.some(
      (value) => !(value instanceof Date) || !Number.isFinite(value.getTime()),
    );
  if (invalidInput) {
    // Fail closed for malformed input. The caller should never offer these slots.
    return new Set(
      input.occurrenceStarts
        .filter((value): value is Date => value instanceof Date && Number.isFinite(value.getTime()))
        .map((value) => value.getTime()),
    );
  }

  const starts = [...new Map(
    input.occurrenceStarts.map((value) => [value.getTime(), value]),
  ).values()].sort((a, b) => a.getTime() - b.getTime());

  const minStart = starts[0];
  const maxEnd = new Date(
    starts[starts.length - 1].getTime() + input.durationMinutes * 60_000,
  );
  // The Academic Mate intentionally may accept several students for the same
  // availability time. Only the same student's overlapping sessions/requests
  // block a candidate time; Academic Mate decisions are made per request.
  const studentFilter = { studentProfileId: input.studentProfileId };

  const [sessions, pendingRequests, recurringRequests, releasedOccurrences] = await Promise.all([
    db.tutoringSession.findMany({
      where: {
        ...(input.excludeSessionId ? { id: { not: input.excludeSessionId } } : {}),
        status: { in: [...ACTIVE_SESSION_STATUSES] },
        scheduledStart: { lt: maxEnd },
        scheduledEnd: { gt: minStart },
        request: { is: studentFilter },
      },
      select: { scheduledStart: true, scheduledEnd: true },
    }),
    db.mateRequest.findMany({
      where: {
        ...(input.excludeRequestId ? { id: { not: input.excludeRequestId } } : {}),
        status: "REQUESTED",
        arrangementStatus: "PENDING",
        requestedStart: { lt: maxEnd },
        requestedEnd: { gt: minStart },
        ...studentFilter,
      },
      select: { requestedStart: true, requestedEnd: true },
    }),
    db.mateRequest.findMany({
      where: {
        ...(input.excludeRequestId && !input.includeExcludedRequestRecurrence
          ? { id: { not: input.excludeRequestId } }
          : {}),
        status: { in: ["REQUESTED", "ACCEPTED"] },
        arrangementStatus: { in: ["PENDING", "ACTIVE", "PAUSED"] },
        arrangementType: "RECURRING",
        requestedStart: { lt: maxEnd },
        ...studentFilter,
      },
      select: {
        id: true,
        requestedStart: true,
        recurrenceEveryWeeks: true,
        recurrenceWeekday: true,
        recurrenceLocalStartMinute: true,
        recurrenceTimezone: true,
        recurrenceEndsAt: true,
        offering: { select: { sessionDurationMinutes: true } },
      },
    }),
    db.tutoringSession.findMany({
      where: {
        occurrenceSlotStart: {
          gte: new Date(minStart.getTime() - 24 * 60 * 60 * 1000),
          lt: maxEnd,
        },
        request: { is: studentFilter },
      },
      select: {
        arrangementId: true,
        occurrenceSlotStart: true,
        scheduledStart: true,
        status: true,
      },
    }),
  ]);

  const releasedOccurrenceKeys = new Set(
    releasedOccurrences
      .filter((session) =>
        session.status === "CANCELLED" ||
        session.scheduledStart.getTime() !== session.occurrenceSlotStart.getTime(),
      )
      .map((session) => `${session.arrangementId}:${session.occurrenceSlotStart.getTime()}`),
  );
  const conflictingStarts = new Set<number>();

  for (const start of starts) {
    const end = new Date(start.getTime() + input.durationMinutes * 60_000);
    if (sessions.some((item) => start < item.scheduledEnd && end > item.scheduledStart)) {
      conflictingStarts.add(start.getTime());
      continue;
    }
    if (pendingRequests.some(
      (item) => item.requestedStart && item.requestedEnd &&
        start < item.requestedEnd && end > item.requestedStart,
    )) {
      conflictingStarts.add(start.getTime());
      continue;
    }

    for (const recurring of recurringRequests) {
      if (!recurring.requestedStart) {
        conflictingStarts.add(start.getTime());
        break;
      }
      const plan: RecurringArrangementPlan = {
        anchorStart: recurring.requestedStart,
        everyWeeks: recurring.recurrenceEveryWeeks,
        weekday: recurring.recurrenceWeekday,
        localStartMinute: recurring.recurrenceLocalStartMinute,
        timezone: recurring.recurrenceTimezone,
        endsAt: recurring.recurrenceEndsAt,
      };
      const occurrences = getRecurringOccurrencesOverlappingRange(
        plan,
        start,
        end,
        recurring.offering.sessionDurationMinutes,
      );
      // Fail closed if a live recurrence is malformed.
      if (occurrences === null) {
        conflictingStarts.add(start.getTime());
        break;
      }
      if (occurrences.some((otherStart) => {
        const isSessionBeingMoved =
          recurring.id === input.excludeRequestId &&
          input.ignoreOccurrenceSlotStart instanceof Date &&
          input.ignoreOccurrenceSlotStart.getTime() === otherStart.getTime();
        return !isSessionBeingMoved &&
          !releasedOccurrenceKeys.has(`${recurring.id}:${otherStart.getTime()}`);
      })) {
        conflictingStarts.add(start.getTime());
        break;
      }
    }
  }

  return conflictingStarts;
}

/** Transactional convenience wrapper used by booking/acceptance flows. */
export async function hasScheduleConflict(
  db: TransactionClient,
  input: ScheduleConflictInput,
): Promise<boolean> {
  const conflictStarts = await getScheduleConflictingStarts(db, input);
  return conflictStarts.size > 0;
}
