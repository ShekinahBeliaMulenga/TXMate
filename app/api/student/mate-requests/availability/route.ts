import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ACTIVE_SESSION_STATUSES,
  generateAvailabilitySlots,
  type AvailabilityWindow,
} from "@/lib/academic-mate-availability";
import { getRecurringOccurrencesOverlappingRange, type RecurringArrangementPlan } from "@/lib/recurring-arrangements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "You must sign in to view available times." }, { status: 401 });
    }

    const offeringId = new URL(request.url).searchParams.get("offeringId")?.trim() ?? "";
    if (!offeringId || offeringId.length > 100) {
      return NextResponse.json({ error: "A valid offeringId is required." }, { status: 400 });
    }

    const student = await prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, universityId: true, status: true },
    });
    if (!student) return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
    if (student.status !== "ACTIVE") {
      return NextResponse.json({ error: "Your student account is not active." }, { status: 403 });
    }

    const offering = await prisma.mateOffering.findFirst({
      where: {
        id: offeringId,
        universityId: student.universityId,
        status: "ACTIVE",
        course: { isActive: true },
        academicMateProfile: {
          status: "ACTIVE",
          verificationStatus: "VERIFIED",
          profileVisibility: { in: ["PUBLIC", "MEMBERS_ONLY"] },
        },
      },
      select: {
        id: true,
        sessionDurationMinutes: true,
        academicMateProfile: { select: { id: true, userId: true } },
      },
    });
    if (!offering) {
      return NextResponse.json({ error: "This offering is unavailable." }, { status: 404 });
    }
    if (offering.academicMateProfile.userId === session.user.id) {
      return NextResponse.json({ error: "You cannot request support from yourself." }, { status: 400 });
    }

    const existingRequest = await prisma.mateRequest.findFirst({
      where: {
        studentProfileId: student.id,
        offeringId: offering.id,
        status: { in: ["REQUESTED", "ACCEPTED"] },
        arrangementStatus: { in: ["PENDING", "ACTIVE", "PAUSED"] },
      },
      select: { id: true },
    });
    if (existingRequest) {
      return NextResponse.json({ error: "You already have a pending or accepted request for this offering." }, { status: 409 });
    }

    const now = new Date();
    const horizonEnd = new Date(now.getTime() + (31 * 24 * 60 * 60 * 1000));
    const availability = await prisma.mateAvailability.findMany({
      where: {
        academicMateProfileId: offering.academicMateProfile.id,
        mateOfferingId: offering.id,
        isActive: true,
      },
      select: { day: true, startMinute: true, endMinute: true, timezone: true },
    });

    const candidates = generateAvailabilitySlots(
      now,
      availability as AvailabilityWindow[],
      offering.sessionDurationMinutes,
    );
    if (candidates.length === 0) return NextResponse.json({ slots: [] });

    const [sessions, pendingRequests, recurringRequests, releasedOccurrences] = await Promise.all([
      prisma.tutoringSession.findMany({
        where: {
          status: { in: [...ACTIVE_SESSION_STATUSES] },
          scheduledStart: { lt: horizonEnd },
          scheduledEnd: { gt: now },
          request: { is: { studentProfileId: student.id } },
        },
        select: { scheduledStart: true, scheduledEnd: true },
      }),
      prisma.mateRequest.findMany({
        where: {
          status: "REQUESTED",
          arrangementStatus: "PENDING",
          requestedStart: { lt: horizonEnd },
          requestedEnd: { gt: now },
          studentProfileId: student.id,
        },
        select: { requestedStart: true, requestedEnd: true },
      }),
      prisma.mateRequest.findMany({
        where: {
          status: { in: ["REQUESTED", "ACCEPTED"] },
          arrangementStatus: { in: ["PENDING", "ACTIVE", "PAUSED"] },
          arrangementType: "RECURRING",
          requestedStart: { lt: horizonEnd },
          studentProfileId: student.id,
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
      prisma.tutoringSession.findMany({
        where: {
          occurrenceSlotStart: {
            gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            lt: horizonEnd,
          },
          request: { is: { studentProfileId: student.id } },
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

    const slots = candidates.filter((candidate) => {
      const sessionConflict = sessions.some(
        (existing) => candidate.start < existing.scheduledEnd && candidate.end > existing.scheduledStart,
      );
      if (sessionConflict) return false;
      if (pendingRequests.some(
        (pending) => pending.requestedStart && pending.requestedEnd &&
          candidate.start < pending.requestedEnd && candidate.end > pending.requestedStart,
      )) return false;

      return !recurringRequests.some((recurring) => {
        if (!recurring.requestedStart) return true;
        const plan: RecurringArrangementPlan = {
          anchorStart: recurring.requestedStart,
          everyWeeks: recurring.recurrenceEveryWeeks,
          weekday: recurring.recurrenceWeekday,
          localStartMinute: recurring.recurrenceLocalStartMinute,
          timezone: recurring.recurrenceTimezone,
          endsAt: recurring.recurrenceEndsAt,
        };
        const projected = getRecurringOccurrencesOverlappingRange(
          plan,
          candidate.start,
          candidate.end,
          recurring.offering.sessionDurationMinutes,
        );
        // Fail closed rather than offering a slot that may conflict with an
        // incomplete active recurring arrangement.
        return projected === null || projected.some((start) =>
          !releasedOccurrenceKeys.has(`${recurring.id}:${start.getTime()}`),
        );
      });
    }).map((slot) => ({
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      timezone: slot.timezone,
      localDate: slot.localDate,
      localStart: slot.localStart,
      localEnd: slot.localEnd,
    }));

    return NextResponse.json({ slots });
  } catch (error) {
    console.error("GET /api/student/mate-requests/availability failed:", error);
    return NextResponse.json({ error: "Unable to load available times." }, { status: 500 });
  }
}
