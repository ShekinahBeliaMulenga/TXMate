import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  findMatchingAvailability,
  getLocalSchedule,
  type AvailabilityWindow,
} from "@/lib/academic-mate-availability";
import { getRecurringOccurrenceStarts, type RecurringArrangementPlan } from "@/lib/recurring-arrangements";
import { hasScheduleConflict } from "@/lib/recurring-arrangement-conflicts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestAction = "ACCEPTED" | "DECLINED";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "You must be signed in to respond to requests." }, { status: 401 });
    }

    const { requestId } = await params;
    if (!requestId?.trim() || requestId.length > 100) {
      return NextResponse.json({ error: "A valid request ID is required." }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must contain valid JSON." }, { status: 400 });
    }
    if (!isPlainObject(body) || Object.keys(body).some((key) => key !== "action") ||
      (body.action !== "ACCEPTED" && body.action !== "DECLINED")) {
      return NextResponse.json({ error: 'Choose either "ACCEPTED" or "DECLINED" as the request action.' }, { status: 400 });
    }
    const action = body.action as RequestAction;

    const academicMate = await prisma.academicMateProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, status: true, verificationStatus: true },
    });
    if (!academicMate) return NextResponse.json({ error: "Academic Mate profile not found." }, { status: 404 });
    if (academicMate.status !== "ACTIVE" || academicMate.verificationStatus !== "VERIFIED") {
      return NextResponse.json({ error: "Only active, verified Academic Mates can respond to requests." }, { status: 403 });
    }

    const requestSelect = {
      id: true,
      status: true,
      requestedStart: true,
      requestedEnd: true,
      initialSessionId: true,
      arrangementType: true,
      recurrenceEveryWeeks: true,
      recurrenceWeekday: true,
      recurrenceLocalStartMinute: true,
      recurrenceTimezone: true,
      recurrenceEndsAt: true,
      studentProfile: {
        select: { id: true, userId: true, universityId: true, status: true },
      },
      offering: {
        select: {
          id: true,
          universityId: true,
          status: true,
          sessionDurationMinutes: true,
          course: { select: { isActive: true, code: true, name: true } },
          academicMateProfile: {
            select: { id: true, userId: true, status: true, verificationStatus: true },
          },
        },
      },
    } as const;

    const ownedRequest = await prisma.mateRequest.findFirst({
      where: { id: requestId, offering: { is: { academicMateProfileId: academicMate.id } } },
      select: requestSelect,
    });
    if (!ownedRequest) {
      return NextResponse.json({ error: "Request not found or you are not authorised to manage it." }, { status: 404 });
    }
    if (ownedRequest.status !== "REQUESTED") {
      return NextResponse.json({
        error: "This request has already been responded to or is no longer pending.",
        currentStatus: ownedRequest.status,
      }, { status: 409 });
    }

    const respondedAt = new Date();

    if (action === "DECLINED") {
      const updateResult = await prisma.mateRequest.updateMany({
        where: {
          id: requestId,
          status: "REQUESTED",
          offering: { is: { academicMateProfileId: academicMate.id } },
        },
        data: { status: "DECLINED", respondedAt },
      });
      if (updateResult.count !== 1) {
        return NextResponse.json({ error: "This request changed before your response could be saved. Refresh and try again." }, { status: 409 });
      }
      return NextResponse.json({
        message: "Request declined successfully.",
        request: { id: requestId, status: "DECLINED", respondedAt },
      });
    }

    // Legacy requests without a proposed time remain compatible; new requests always include one.
    if (!ownedRequest.requestedStart) {
      const updateResult = await prisma.mateRequest.updateMany({
        where: {
          id: requestId,
          status: "REQUESTED",
          offering: { is: { academicMateProfileId: academicMate.id } },
        },
        data: { status: "ACCEPTED", respondedAt },
      });
      if (updateResult.count !== 1) {
        return NextResponse.json({ error: "This request changed before your response could be saved. Refresh and try again." }, { status: 409 });
      }
      return NextResponse.json({
        message: "Request accepted. This older request still needs a session to be booked separately.",
        request: { id: requestId, status: "ACCEPTED", respondedAt },
      });
    }

    if (!ownedRequest.requestedEnd) {
      return NextResponse.json({ error: "This request has no complete proposed session time. Ask the student to submit a new request." }, { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const lockKeys = [`student:${ownedRequest.studentProfile.id}`, `academic-mate:${academicMate.id}`].sort();
      for (const lockKey of lockKeys) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      }

      const currentRequest = await tx.mateRequest.findFirst({
        where: {
          id: requestId,
          offering: { is: { academicMateProfileId: academicMate.id } },
        },
        select: requestSelect,
      });
      if (!currentRequest) return { kind: "not-found" as const };
      if (currentRequest.status !== "REQUESTED" || currentRequest.initialSessionId) {
        return { kind: "not-pending" as const, status: currentRequest.status };
      }
      if (!currentRequest.requestedStart || !currentRequest.requestedEnd) {
        return { kind: "missing-time" as const };
      }

      const studentProfile = currentRequest.studentProfile;
      const offering = currentRequest.offering;
      const mate = offering.academicMateProfile;
      if (
        studentProfile.status !== "ACTIVE" ||
        studentProfile.universityId !== offering.universityId ||
        offering.status !== "ACTIVE" ||
        !offering.course.isActive ||
        mate.status !== "ACTIVE" ||
        mate.verificationStatus !== "VERIFIED" ||
        mate.id !== academicMate.id ||
        mate.userId !== session.user.id
      ) {
        return { kind: "offering-unavailable" as const };
      }

      const now = new Date();
      const scheduledStart = currentRequest.requestedStart;
      const scheduledEnd = currentRequest.requestedEnd;
      const expectedEnd = new Date(scheduledStart.getTime() + offering.sessionDurationMinutes * 60_000);
      if (scheduledStart <= now) return { kind: "past-time" as const };
      if (expectedEnd.getTime() !== scheduledEnd.getTime()) return { kind: "invalid-slot" as const };

      const availability = await tx.mateAvailability.findMany({
        where: { academicMateProfileId: mate.id, mateOfferingId: offering.id, isActive: true },
        select: { day: true, startMinute: true, endMinute: true, timezone: true },
      });
      const matchingAvailability = findMatchingAvailability(
        scheduledStart,
        offering.sessionDurationMinutes,
        availability as AvailabilityWindow[],
      );
      if (!matchingAvailability) return { kind: "invalid-slot" as const };

      let validationStarts = [scheduledStart];
      let futureStarts: Date[] = [];
      if (currentRequest.arrangementType === "RECURRING") {
        if (
          currentRequest.recurrenceEveryWeeks === null ||
          currentRequest.recurrenceWeekday === null ||
          currentRequest.recurrenceLocalStartMinute === null ||
          !currentRequest.recurrenceTimezone
        ) {
          return { kind: "invalid-recurrence" as const };
        }
        const recurrenceAvailability = availability.find((window) =>
          window.timezone === currentRequest.recurrenceTimezone &&
          findMatchingAvailability(
            scheduledStart,
            offering.sessionDurationMinutes,
            [window as AvailabilityWindow],
          ) !== null,
        );
        if (!recurrenceAvailability) return { kind: "invalid-slot" as const };
        const localSchedule = getLocalSchedule(scheduledStart, currentRequest.recurrenceTimezone);
        if (
          !localSchedule ||
          localSchedule.weekday !== currentRequest.recurrenceWeekday ||
          localSchedule.localStartMinute !== currentRequest.recurrenceLocalStartMinute
        ) {
          return { kind: "invalid-recurrence" as const };
        }

        const plan: RecurringArrangementPlan = {
          anchorStart: scheduledStart,
          everyWeeks: currentRequest.recurrenceEveryWeeks,
          weekday: currentRequest.recurrenceWeekday,
          localStartMinute: currentRequest.recurrenceLocalStartMinute,
          timezone: currentRequest.recurrenceTimezone,
          endsAt: currentRequest.recurrenceEndsAt,
        };
        const validationThrough = new Date(scheduledStart.getTime() + 30 * 24 * 60 * 60 * 1000);
        const projectedStarts = getRecurringOccurrenceStarts(
          plan,
          scheduledStart,
          validationThrough,
          true,
        );
        if (!projectedStarts || projectedStarts.length < 2) {
          return { kind: "invalid-recurrence" as const };
        }
        validationStarts = projectedStarts;
        const startsInCurrentWindow = getRecurringOccurrenceStarts(
          plan,
          now,
          new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          false,
        );
        if (startsInCurrentWindow === null) {
          return { kind: "invalid-recurrence" as const };
        }
        futureStarts = startsInCurrentWindow;
      }

      const scheduleConflict = await hasScheduleConflict(tx, {
        occurrenceStarts: validationStarts,
        durationMinutes: offering.sessionDurationMinutes,
        studentProfileId: studentProfile.id,
        academicMateProfileId: mate.id,
        excludeRequestId: currentRequest.id,
      });
      if (scheduleConflict) return { kind: "schedule-conflict" as const };

      // Claim the request before creating the session. The transaction rolls back both writes on failure.
      const claim = await tx.mateRequest.updateMany({
        where: {
          id: currentRequest.id,
          status: "REQUESTED",
          arrangementStatus: "PENDING",
          initialSessionId: null,
        },
        data: { status: "ACCEPTED", respondedAt: now },
      });
      if (claim.count !== 1) return { kind: "not-pending" as const, status: "CHANGED" };

      const createdSession = await tx.tutoringSession.create({
        data: {
          arrangementId: currentRequest.id,
          scheduledStart,
          scheduledEnd,
          occurrenceSlotStart: scheduledStart,
          meetingLocation: "To be agreed in conversation",
          status: "SCHEDULED",
        },
        select: {
          id: true,
          scheduledStart: true,
          scheduledEnd: true,
          meetingLocation: true,
          status: true,
        },
      });

      const recurringSessions = futureStarts.length > 0
        ? await tx.tutoringSession.createMany({
            data: futureStarts.map((start) => ({
              arrangementId: currentRequest.id,
              scheduledStart: start,
              scheduledEnd: new Date(start.getTime() + offering.sessionDurationMinutes * 60_000),
              occurrenceSlotStart: start,
              meetingLocation: "To be agreed in conversation",
              status: "SCHEDULED" as const,
            })),
            skipDuplicates: true,
          })
        : { count: 0 };

      const updatedRequest = await tx.mateRequest.update({
        where: { id: currentRequest.id },
        data: { initialSessionId: createdSession.id, arrangementStatus: "ACTIVE" },
        select: { id: true, status: true, respondedAt: true, arrangementType: true },
      });

      const conversation = await tx.conversation.upsert({
        where: { requestId: currentRequest.id },
        create: { requestId: currentRequest.id },
        update: {},
        select: { id: true },
      });

      const sessionNotificationData = {
        requestId: currentRequest.id,
        sessionId: createdSession.id,
        conversationId: conversation.id,
        scheduledStart: createdSession.scheduledStart.toISOString(),
      };
      await tx.notification.createMany({
        data: [
          {
            userId: studentProfile.userId,
            type: "SESSION_SCHEDULED",
            title: currentRequest.arrangementType === "RECURRING" ? "Your tutoring arrangement is active" : "Your first tutoring session is scheduled",
            body: currentRequest.arrangementType === "RECURRING"
              ? `Your Academic Mate accepted the recurring arrangement. The first session is scheduled${recurringSessions.count > 0 ? `, with ${recurringSessions.count} additional session${recurringSessions.count === 1 ? "" : "s"} scheduled in the current 30-day window` : ""}. TXMate will keep adding future sessions as they enter the scheduling window.`
              : "Your Academic Mate accepted your request. The proposed first session is now scheduled. Open TXMate to view the details.",
            data: sessionNotificationData,
          },
          {
            userId: mate.userId,
            type: "SESSION_SCHEDULED",
            title: "Tutoring session scheduled",
            body: currentRequest.arrangementType === "RECURRING"
              ? `Your recurring arrangement for ${offering.course.code} · ${offering.course.name} was accepted. The first session is scheduled${recurringSessions.count > 0 ? `, with ${recurringSessions.count} additional session${recurringSessions.count === 1 ? "" : "s"} scheduled in the current 30-day window` : ""}. TXMate will keep adding future sessions as they enter the scheduling window.`
              : `Your request for ${offering.course.code} · ${offering.course.name} was accepted and the first session is scheduled.`,
            data: sessionNotificationData,
          },
        ],
      });

      return {
        kind: "scheduled" as const,
        request: updatedRequest,
        session: createdSession,
        conversationId: conversation.id,
        recurringSessionsCreated: recurringSessions.count,
      };
    }, { maxWait: 5_000, timeout: 15_000 });

    if (result.kind !== "scheduled") {
      const responses = {
        "not-found": { status: 404, error: "Request not found or you are not authorised to manage it." },
        "not-pending": { status: 409, error: "This request changed before it could be accepted. Refresh and try again." },
        "missing-time": { status: 409, error: "This request has no complete proposed session time. Ask the student to submit a new request." },
        "offering-unavailable": { status: 409, error: "This offering is no longer available." },
        "past-time": { status: 409, error: "The proposed time has passed. The student needs to submit a new request with another available time." },
        "invalid-slot": { status: 409, error: "The proposed time no longer matches your availability. Ask the student to submit a new request with another available time." },
        "session-conflict": { status: 409, error: "You or the student already has a session during the proposed time. The request was not accepted." },
        "pending-conflict": { status: 409, error: "Another pending request already uses this time. Resolve that request before accepting this one." },
        "schedule-conflict": { status: 409, error: "At least one occurrence in this recurring schedule now conflicts with another session or pending request. Do not accept this arrangement yet. Ask the student to submit a request with a different recurring time." },
        "invalid-recurrence": { status: 409, error: "This recurring schedule is incomplete or invalid. Ask the student to submit the request again with a valid recurrence." },
      } as const;
      const mapped = responses[result.kind];
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    return NextResponse.json({
      message: result.request.arrangementType === "RECURRING"
        ? `Request accepted. The first session is scheduled${result.recurringSessionsCreated > 0 ? `, with ${result.recurringSessionsCreated} additional session${result.recurringSessionsCreated === 1 ? "" : "s"} in the current 30-day window` : ""}. TXMate will keep adding future sessions as they enter the scheduling window.`
        : "Request accepted and the first session has been scheduled.",
      request: { ...result.request, respondedAt: result.request.respondedAt?.toISOString() ?? null },
      session: {
        ...result.session,
        scheduledStart: result.session.scheduledStart.toISOString(),
        scheduledEnd: result.session.scheduledEnd.toISOString(),
      },
      conversationId: result.conversationId,
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : null;
    if (code === "P2034" || code === "P2028") {
      return NextResponse.json({ error: "The booking system is busy. Please refresh and try again." }, { status: 503 });
    }
    console.error("PATCH /api/student/academic-mate/requests/[requestId] failed:", error);
    return NextResponse.json({ error: "Unable to respond to this request." }, { status: 500 });
  }
}
