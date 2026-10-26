import { clashesWithMateSession, type MateSlot } from "@/lib/mate-slots";
import { ACTIVE_SESSION_STATUSES } from "@/lib/academic-mate-availability";
import type { Weekday } from "@/generated/prisma/client";
import type { prisma as PrismaInstance } from "@/lib/prisma";

type Db = Pick<typeof PrismaInstance, "tutoringSession" | "mateAvailability">;

/**
 * Which of these start times would put the Academic Mate in two places at once.
 * Read-only; booking and acceptance flows call it inside their transaction.
 */
export async function getMateBusyStarts(
  db: Pick<Db, "tutoringSession">,
  input: {
    academicMateProfileId: string;
    offeringId: string;
    durationMinutes: number;
    occurrenceStarts: Date[];
    /** The arrangement being decided, whose own sessions must not count against it. */
    excludeArrangementId?: string;
  },
): Promise<Set<number>> {
  const busy = new Set<number>();
  const starts = input.occurrenceStarts.filter((value) => Number.isFinite(value.getTime()));
  if (starts.length === 0 || !(input.durationMinutes > 0)) return busy;
  const durationMs = input.durationMinutes * 60_000;
  const times = starts.map((value) => value.getTime());
  const rangeStart = new Date(Math.min(...times));
  const rangeEnd = new Date(Math.max(...times) + durationMs);

  const sessions = await db.tutoringSession.findMany({
    where: {
      status: { in: [...ACTIVE_SESSION_STATUSES] },
      scheduledStart: { lt: rangeEnd },
      scheduledEnd: { gt: rangeStart },
      request: {
        is: {
          offering: { academicMateProfileId: input.academicMateProfileId },
          ...(input.excludeArrangementId ? { id: { not: input.excludeArrangementId } } : {}),
        },
      },
    },
    select: { scheduledStart: true, scheduledEnd: true, request: { select: { offeringId: true } } },
  });
  const existing: MateSlot[] = sessions.map((item) => ({
    offeringId: item.request.offeringId,
    start: item.scheduledStart.getTime(),
    end: item.scheduledEnd.getTime(),
  }));
  for (const start of times) {
    if (clashesWithMateSession({ offeringId: input.offeringId, start, end: start + durationMs }, existing)) busy.add(start);
  }
  return busy;
}

/**
 * Plain-language warnings when a weekly availability window overlaps the same Academic Mate's
 * window for a different course. Allowed (the days may differ week to week) but worth a heads-up.
 */
export async function findCrossCourseOverlapWarnings(
  db: Pick<Db, "mateAvailability">,
  input: {
    academicMateProfileId: string;
    offeringId: string;
    day: Weekday;
    startMinute: number;
    endMinute: number;
  },
): Promise<string[]> {
  const overlaps = await db.mateAvailability.findMany({
    where: {
      academicMateProfileId: input.academicMateProfileId,
      mateOfferingId: { not: input.offeringId },
      day: input.day,
      isActive: true,
      startMinute: { lt: input.endMinute },
      endMinute: { gt: input.startMinute },
    },
    select: { mateOffering: { select: { course: { select: { code: true, name: true } } } } },
    take: 5,
  });
  const names = [...new Set(overlaps.map((item) => {
    const course = item.mateOffering.course;
    return course.code ? `${course.code} · ${course.name}` : course.name;
  }))];
  return names.map((name) => `This time overlaps your availability for ${name}. If both get booked at once you won't be able to accept both, so you may want to move one.`);
}
