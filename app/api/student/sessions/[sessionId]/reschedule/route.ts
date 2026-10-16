
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

const ACTIVE_SESSION_STATUSES = [
  "SCHEDULED",
  "IN_PROGRESS",
  "DISPUTED",
] as const;

const WEEKDAYS = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function matchesAvailability(
  start: Date,
  durationMinutes: number,
  availability: {
    day: (typeof WEEKDAYS)[number];
    startMinute: number;
    endMinute: number;
    timezone: string;
  },
): boolean {
  if (
    start.getUTCSeconds() !== 0 ||
    start.getUTCMilliseconds() !== 0 ||
    availability.endMinute - availability.startMinute !==
      durationMinutes
  ) {
    return false;
  }

  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: availability.timezone,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(start);

    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value;

    const weekday = get("weekday")?.toUpperCase();
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));

    return (
      WEEKDAYS.includes(weekday as (typeof WEEKDAYS)[number]) &&
      weekday === availability.day &&
      hour * 60 + minute === availability.startMinute
    );
  } catch {
    return false;
  }
}

export async function POST(
  request: Request,
  { params }: RouteContext,
) {
  try {
    const authSession = await auth.api.getSession({
      headers: await headers(),
    });

    if (!authSession?.user) {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 },
      );
    }

    const { sessionId } = await params;

    if (!sessionId?.trim() || sessionId.length > 100) {
      return NextResponse.json(
        { error: "A valid session ID is required." },
        { status: 400 },
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must contain valid JSON." },
        { status: 400 },
      );
    }

    if (
      !isPlainObject(body) ||
      Object.keys(body).some(
        (key) => key !== "proposedStart" && key !== "reason",
      ) ||
      typeof body.proposedStart !== "string" ||
      (body.reason !== undefined &&
        typeof body.reason !== "string")
    ) {
      return NextResponse.json(
        {
          error:
            'Provide "proposedStart" as an ISO timestamp and optionally "reason".',
        },
        { status: 400 },
      );
    }

    const proposedStart = new Date(body.proposedStart);
    const reason =
      typeof body.reason === "string" ? body.reason.trim() : "";

    if (
      Number.isNaN(proposedStart.getTime()) ||
      !body.proposedStart.includes("T")
    ) {
      return NextResponse.json(
        { error: "A valid ISO timestamp is required." },
        { status: 400 },
      );
    }

    if (reason.length > 500) {
      return NextResponse.json(
        { error: "The reason cannot exceed 500 characters." },
        { status: 400 },
      );
    }

    const existing = await prisma.tutoringSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        request: {
          select: {
            studentProfile: {
              select: {
                id: true,
                userId: true,
                user: { select: { name: true } },
              },
            },
            offering: {
              select: {
                id: true,
                title: true,
                sessionDurationMinutes: true,
                course: { select: { name: true } },
                academicMateProfile: {
                  select: {
                    id: true,
                    userId: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Session not found." },
        { status: 404 },
      );
    }

    const student = existing.request.studentProfile;
    const offering = existing.request.offering;
    const mate = offering.academicMateProfile;
    const userId = authSession.user.id;

    if (userId !== student.userId && userId !== mate.userId) {
      return NextResponse.json(
        { error: "You are not a participant in this session." },
        { status: 403 },
      );
    }

    if (existing.status !== "SCHEDULED") {
      return NextResponse.json(
        {
          error:
            "Only scheduled sessions can be rescheduled.",
        },
        { status: 409 },
      );
    }

    if (existing.scheduledStart <= new Date()) {
      return NextResponse.json(
        {
          error:
            "A session cannot be rescheduled after it has started.",
        },
        { status: 409 },
      );
    }

    if (proposedStart <= new Date()) {
      return NextResponse.json(
        { error: "Choose a future start time." },
        { status: 400 },
      );
    }

    if (
      proposedStart.getTime() ===
      existing.scheduledStart.getTime()
    ) {
      return NextResponse.json(
        { error: "Choose a different start time." },
        { status: 400 },
      );
    }

    if (mate.status !== "ACTIVE") {
      return NextResponse.json(
        {
          error:
            "The Academic Mate's account is not active.",
        },
        { status: 409 },
      );
    }

    const durationMinutes =
      offering.sessionDurationMinutes;

    const proposedEnd = new Date(
      proposedStart.getTime() + durationMinutes * 60_000,
    );

    const responderId =
      userId === student.userId ? mate.userId : student.userId;

    const result = await prisma.$transaction(async (tx) => {
      // Use the same participant locks as the booking flow.
      const lockKeys = [
        `student:${student.id}`,
        `academic-mate:${mate.id}`,
      ].sort();

      for (const lockKey of lockKeys) {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${lockKey}, 0)
          )
        `;
      }

      const current = await tx.tutoringSession.findUnique({
        where: { id: sessionId },
        select: {
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
        },
      });

      if (
        !current ||
        current.status !== "SCHEDULED" ||
        current.scheduledStart <= new Date()
      ) {
        return { kind: "session-changed" as const };
      }

      const pending =
        await tx.sessionRescheduleRequest.findFirst({
          where: {
            sessionId,
            status: "PENDING",
          },
          select: { id: true },
        });

      if (pending) {
        return { kind: "pending" as const };
      }

      const availability = await tx.mateAvailability.findMany({
        where: {
          academicMateProfileId: mate.id,
          mateOfferingId: offering.id,
          isActive: true,
        },
        select: {
          day: true,
          startMinute: true,
          endMinute: true,
          timezone: true,
        },
      });

      if (
        !availability.some((window) =>
          matchesAvailability(
            proposedStart,
            durationMinutes,
            window,
          ),
        )
      ) {
        return { kind: "invalid-slot" as const };
      }

      const conflict =
        await tx.tutoringSession.findFirst({
          where: {
            id: { not: sessionId },
            status: { in: [...ACTIVE_SESSION_STATUSES] },
            scheduledStart: { lt: proposedEnd },
            scheduledEnd: { gt: proposedStart },
            request: {
              is: {
                OR: [
                  { studentProfileId: student.id },
                  {
                    offering: {
                      is: {
                        academicMateProfileId: mate.id,
                      },
                    },
                  },
                ],
              },
            },
          },
          select: { id: true },
        });

      if (conflict) {
        return { kind: "conflict" as const };
      }

      const proposal =
        await tx.sessionRescheduleRequest.create({
          data: {
            sessionId,
            proposedByUserId: userId,
            respondingUserId: responderId,
            proposedStart,
            proposedEnd,
            reason: reason || null,
          },
          select: {
            id: true,
            proposedStart: true,
            proposedEnd: true,
            status: true,
          },
        });

      await tx.notification.create({
        data: {
          userId: responderId,
          type: "SYSTEM",
          title: "Session rescheduling proposed",
          body:
            `${authSession.user.name || "Your session partner"} ` +
            "proposed a new time for your tutoring session. " +
            "Review the proposal in TXMate.",
          data: {
            sessionId,
            rescheduleRequestId: proposal.id,
            proposedStart: proposal.proposedStart.toISOString(),
          },
        },
      });

      return {
        kind: "created" as const,
        proposal,
      };
    });

    if (result.kind === "session-changed") {
      return NextResponse.json(
        { error: "The session changed. Refresh and try again." },
        { status: 409 },
      );
    }

    if (result.kind === "pending") {
      return NextResponse.json(
        {
          error:
            "A rescheduling proposal is already awaiting a response.",
        },
        { status: 409 },
      );
    }

    if (result.kind === "invalid-slot") {
      return NextResponse.json(
        {
          error:
            "The proposed time does not match the Academic Mate's available slots.",
        },
        { status: 409 },
      );
    }

    if (result.kind === "conflict") {
      return NextResponse.json(
        {
          error:
            "You or the Academic Mate already has a session during that time.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        message:
          "Rescheduling proposal sent. The session time has not changed yet.",
        proposal: {
          id: result.proposal.id,
          proposedStart:
            result.proposal.proposedStart.toISOString(),
          proposedEnd:
            result.proposal.proposedEnd.toISOString(),
          status: result.proposal.status,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST session reschedule proposal failed:", error);

    return NextResponse.json(
      { error: "Unable to submit the rescheduling proposal." },
      { status: 500 },
    );
  }
}
