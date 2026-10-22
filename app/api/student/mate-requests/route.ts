import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  findMatchingAvailability,
  getLocalSchedule,
  type AvailabilityWindow,
} from "@/lib/academic-mate-availability";
import {
  getRecurringOccurrenceStarts,
  RECURRING_INTERVAL_OPTIONS,
  type RecurringArrangementPlan,
} from "@/lib/recurring-arrangements";
import { hasScheduleConflict } from "@/lib/recurring-arrangement-conflicts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 1000;
const ISO_DATETIME_WITH_TIMEZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

type ErrorResult = {
  kind:
    | "offering-unavailable"
    | "self-request"
    | "duplicate-request"
    | "past-time"
    | "invalid-slot"
    | "session-conflict"
    | "pending-conflict"
    | "invalid-recurrence"
    | "schedule-conflict";
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function prismaErrorCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error &&
    typeof (error as { code: unknown }).code === "string"
    ? (error as { code: string }).code
    : null;
}

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "You must be signed in to request academic support." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must contain valid JSON." }, { status: 400 });
    }

    if (!isPlainObject(body)) {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }

    const allowedFields = new Set([
      "offeringId", "message", "requestedStart", "arrangementType",
      "recurrenceEveryWeeks",
    ]);
    if (!Object.keys(body).every((key) => allowedFields.has(key))) {
      return NextResponse.json({ error: "Request contains unsupported fields." }, { status: 400 });
    }

    const offeringId = typeof body.offeringId === "string" ? body.offeringId.trim() : "";
    if (!offeringId || offeringId.length > 100) {
      return NextResponse.json({ error: "A valid offeringId is required." }, { status: 400 });
    }

    if (typeof body.requestedStart !== "string" || !ISO_DATETIME_WITH_TIMEZONE.test(body.requestedStart)) {
      return NextResponse.json({ error: "Choose an available first-session time." }, { status: 400 });
    }
    const requestedStart = new Date(body.requestedStart);
    if (!Number.isFinite(requestedStart.getTime())) {
      return NextResponse.json({ error: "The selected time is invalid." }, { status: 400 });
    }

    const arrangementType = body.arrangementType === undefined ? "ONE_TIME" : body.arrangementType;
    if (arrangementType !== "ONE_TIME" && arrangementType !== "RECURRING") {
      return NextResponse.json({ error: "Choose a valid arrangement type." }, { status: 400 });
    }
    const recurrenceEveryWeeks = body.recurrenceEveryWeeks;
    if (arrangementType === "RECURRING") {
      if (
        !Number.isInteger(recurrenceEveryWeeks) ||
        !RECURRING_INTERVAL_OPTIONS.includes(recurrenceEveryWeeks as (typeof RECURRING_INTERVAL_OPTIONS)[number])
      ) {
        return NextResponse.json({ error: "Choose how often recurring sessions should take place." }, { status: 400 });
      }
    } else if (
      (recurrenceEveryWeeks !== undefined && recurrenceEveryWeeks !== null)
    ) {
      return NextResponse.json({ error: "One-time arrangements cannot include recurring settings." }, { status: 400 });
    }

    if (body.message !== undefined && body.message !== null && typeof body.message !== "string") {
      return NextResponse.json({ error: "Message must be a string or null." }, { status: 400 });
    }
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` }, { status: 400 });
    }

    const student = await prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, universityId: true, status: true },
    });
    if (!student) {
      return NextResponse.json({ error: "Student profile not found. Complete onboarding first." }, { status: 404 });
    }
    if (student.status !== "ACTIVE") {
      return NextResponse.json({ error: "Your student account is not active." }, { status: 403 });
    }

    const initialOffering = await prisma.mateOffering.findFirst({
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
        universityId: true,
        title: true,
        rate: true,
        currency: true,
        rateType: true,
        sessionDurationMinutes: true,
        course: { select: { id: true, code: true, name: true } },
        academicMateProfile: {
          select: {
            id: true,
            userId: true,
            user: { select: { name: true, image: true } },
          },
        },
      },
    });
    if (!initialOffering) {
      return NextResponse.json({ error: "This offering is unavailable or does not belong to your university." }, { status: 404 });
    }
    if (initialOffering.academicMateProfile.userId === session.user.id) {
      return NextResponse.json({ error: "You cannot request academic support from yourself." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Serialize request proposals and acceptances for the same student or Academic Mate.
      const lockKeys = [`student:${student.id}`, `academic-mate:${initialOffering.academicMateProfile.id}`].sort();
      for (const lockKey of lockKeys) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      }

      const currentOffering = await tx.mateOffering.findFirst({
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
          universityId: true,
          title: true,
          rate: true,
          currency: true,
          rateType: true,
          sessionDurationMinutes: true,
          course: { select: { id: true, code: true, name: true } },
          academicMateProfile: {
            select: {
              id: true,
              userId: true,
              user: { select: { name: true, image: true } },
            },
          },
        },
      });
      if (!currentOffering) return { kind: "offering-unavailable" } as ErrorResult;
      if (currentOffering.academicMateProfile.userId === session.user.id) return { kind: "self-request" } as ErrorResult;

      const now = new Date();
      if (requestedStart <= now) return { kind: "past-time" } as ErrorResult;

      const existingRequest = await tx.mateRequest.findFirst({
        where: {
          studentProfileId: student.id,
          offeringId: currentOffering.id,
          status: { in: ["REQUESTED", "ACCEPTED"] },
          arrangementStatus: { in: ["PENDING", "ACTIVE", "PAUSED"] },
        },
        select: { id: true },
      });
      if (existingRequest) return { kind: "duplicate-request" } as ErrorResult;

      const availability = await tx.mateAvailability.findMany({
        where: {
          academicMateProfileId: currentOffering.academicMateProfile.id,
          mateOfferingId: currentOffering.id,
          isActive: true,
        },
        select: { day: true, startMinute: true, endMinute: true, timezone: true },
      });
      const matchingAvailability = findMatchingAvailability(
        requestedStart,
        currentOffering.sessionDurationMinutes,
        availability as AvailabilityWindow[],
      );
      if (!matchingAvailability) return { kind: "invalid-slot" } as ErrorResult;

      const requestedEnd = new Date(requestedStart.getTime() + currentOffering.sessionDurationMinutes * 60_000);
      let recurrenceWeekday = null as RecurringArrangementPlan["weekday"];
      let recurrenceLocalStartMinute = null as RecurringArrangementPlan["localStartMinute"];
      let recurrenceTimezone = null as RecurringArrangementPlan["timezone"];
      const recurrenceEndsAt: Date | null = null;
      let occurrenceStarts = [requestedStart];

      if (arrangementType === "RECURRING") {
        const localSchedule = getLocalSchedule(requestedStart, matchingAvailability.timezone);
        if (!localSchedule) return { kind: "invalid-recurrence" } as ErrorResult;
        recurrenceWeekday = localSchedule.weekday;
        recurrenceLocalStartMinute = localSchedule.localStartMinute;
        recurrenceTimezone = matchingAvailability.timezone;

        const plan: RecurringArrangementPlan = {
          anchorStart: requestedStart,
          everyWeeks: recurrenceEveryWeeks as number,
          weekday: recurrenceWeekday,
          localStartMinute: recurrenceLocalStartMinute,
          timezone: recurrenceTimezone,
          endsAt: recurrenceEndsAt,
        };
        const validationThrough = new Date(requestedStart.getTime() + 30 * 24 * 60 * 60 * 1000);
        const projectedStarts = getRecurringOccurrenceStarts(
          plan,
          requestedStart,
          validationThrough,
          true,
        );
        // A recurring request must reserve at least one follow-up occurrence.
        if (!projectedStarts || projectedStarts.length < 2) {
          return { kind: "invalid-recurrence" } as ErrorResult;
        }
        occurrenceStarts = projectedStarts;
      }

      const scheduleConflict = await hasScheduleConflict(tx, {
        occurrenceStarts,
        durationMinutes: currentOffering.sessionDurationMinutes,
        studentProfileId: student.id,
        academicMateProfileId: currentOffering.academicMateProfile.id,
      });
      if (scheduleConflict) return { kind: "schedule-conflict" } as ErrorResult;

      const createdRequest = await tx.mateRequest.create({
        data: {
          studentProfileId: student.id,
          offeringId: currentOffering.id,
          universityId: student.universityId,
          message: message || null,
          requestedStart,
          requestedEnd,
          arrangementType,
          arrangementStatus: "PENDING",
          recurrenceEveryWeeks: arrangementType === "RECURRING" ? recurrenceEveryWeeks as number : null,
          recurrenceWeekday: arrangementType === "RECURRING" ? recurrenceWeekday : null,
          recurrenceLocalStartMinute: arrangementType === "RECURRING" ? recurrenceLocalStartMinute : null,
          recurrenceTimezone: arrangementType === "RECURRING" ? recurrenceTimezone : null,
          recurrenceEndsAt: arrangementType === "RECURRING" ? recurrenceEndsAt : null,
        },
        select: {
          id: true,
          status: true,
          message: true,
          requestedStart: true,
          requestedEnd: true,
          arrangementType: true,
          recurrenceEveryWeeks: true,
          recurrenceWeekday: true,
          recurrenceLocalStartMinute: true,
          recurrenceTimezone: true,
          recurrenceEndsAt: true,
          createdAt: true,
        },
      });

      const proposedTimeLabel = new Intl.DateTimeFormat("en-ZM", {
        timeZone: matchingAvailability.timezone,
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(requestedStart);
      const studentName = session.user.name?.trim() || "A student";
      const courseCode = currentOffering.course.code;
      const courseName = currentOffering.course.name;
      const arrangementLabel = arrangementType === "RECURRING"
        ? `recurring tutoring every ${recurrenceEveryWeeks} week${recurrenceEveryWeeks === 1 ? "" : "s"}`
        : "a one-time tutoring session";

      await tx.notification.create({
        data: {
          userId: currentOffering.academicMateProfile.userId,
          type: "MATE_REQUEST",
          title: `New request from ${studentName}`,
          body: `${studentName} requested ${courseCode} · ${courseName} for ${arrangementLabel}, proposing ${proposedTimeLabel} (${matchingAvailability.timezone}) as the first session.`,
          data: {
            requestId: createdRequest.id,
            offeringId: currentOffering.id,
            offeringTitle: currentOffering.title,
            studentName,
            courseCode,
            courseName,
            arrangementType,
            recurrenceEveryWeeks: arrangementType === "RECURRING" ? recurrenceEveryWeeks as number : null,
            requestedStart: requestedStart.toISOString(),
            requestedEnd: requestedEnd.toISOString(),
            timezone: matchingAvailability.timezone,
            url: "/student/academic-mate/requests",
          },
        },
      });

      return {
        kind: "created",
        request: createdRequest,
        offering: currentOffering,
        requestedStart,
        requestedEnd,
        arrangementType,
      } as const;
    }, { maxWait: 5_000, timeout: 15_000 });

    if (result.kind !== "created") {
      const errors: Record<ErrorResult["kind"], { error: string; status: number }> = {
        "offering-unavailable": { error: "This offering is no longer available.", status: 409 },
        "self-request": { error: "You cannot request academic support from yourself.", status: 400 },
        "duplicate-request": { error: "You already have a pending or accepted request for this offering.", status: 409 },
        "past-time": { error: "Choose a future session time.", status: 400 },
        "invalid-slot": { error: "That time no longer matches the Academic Mate's availability. Refresh the available times and choose another slot.", status: 409 },
        "session-conflict": { error: "You or the Academic Mate already has a session during that time. Choose another slot.", status: 409 },
        "pending-conflict": { error: "That time has already been proposed in another pending request. Choose another available slot.", status: 409 },
        "invalid-recurrence": { error: "Choose a recurring schedule that includes at least one future session within the next 30 days.", status: 400 },
        "schedule-conflict": {
          error: arrangementType === "RECURRING"
            ? "At least one occurrence in that recurring schedule conflicts with an existing session or pending request for you or the Academic Mate. Choose another recurring time."
            : "That time conflicts with an existing session or pending request for you or the Academic Mate. Refresh available times and choose another slot.",
          status: 409,
        },
      };
      const mapped = errors[result.kind];
      return NextResponse.json(mapped, { status: mapped.status });
    }

    return NextResponse.json({
      message: "Your request and proposed first-session time have been sent to the Academic Mate.",
      request: {
        ...result.request,
        requestedStart: result.requestedStart.toISOString(),
        requestedEnd: result.requestedEnd.toISOString(),
        arrangementType: result.request.arrangementType,
        recurrenceEveryWeeks: result.request.recurrenceEveryWeeks,
        recurrenceWeekday: result.request.recurrenceWeekday,
        recurrenceLocalStartMinute: result.request.recurrenceLocalStartMinute,
        recurrenceTimezone: result.request.recurrenceTimezone,
        recurrenceEndsAt: result.request.recurrenceEndsAt?.toISOString() ?? null,
        offering: {
          title: result.offering.title,
          rate: result.offering.rate.toString(),
          currency: result.offering.currency,
          rateType: result.offering.rateType,
          course: result.offering.course,
          academicMate: result.offering.academicMateProfile.user,
        },
      },
    }, { status: 201 });
  } catch (error) {
    if (prismaErrorCode(error) === "P2002") {
      return NextResponse.json({ error: "You already have a pending or accepted request for this offering." }, { status: 409 });
    }
    if (["P2028", "P2034"].includes(prismaErrorCode(error) ?? "")) {
      return NextResponse.json({ error: "The booking system is busy. Please try again." }, { status: 503 });
    }
    console.error("POST /api/student/mate-requests failed:", error);
    return NextResponse.json({ error: "Unable to submit your academic support request." }, { status: 500 });
  }
}
