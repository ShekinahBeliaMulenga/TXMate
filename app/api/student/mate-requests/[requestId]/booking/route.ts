// app/api/student/mate-requests/[requestId]/booking/route.ts

import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { Weekday } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOKING_WINDOW_DAYS = 30;

const ACTIVE_SESSION_STATUSES = [
  "SCHEDULED",
  "IN_PROGRESS",
  "DISPUTED",
] as const;

const WEEKDAYS: Weekday[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

const bookingRequestSelect = {
  id: true,
  status: true,
  studentProfile: {
    select: {
      id: true,
      userId: true,
      status: true,
    },
  },
  offering: {
    select: {
      id: true,
      status: true,
      sessionDurationMinutes: true,
      course: {
        select: {
          isActive: true,
        },
      },
      academicMateProfile: {
        select: {
          id: true,
          userId: true,
          status: true,
          verificationStatus: true,
        },
      },
    },
  },
  tutoringSession: {
    select: {
      id: true,
    },
  },
} as const;

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/** Extracts a Prisma error code (e.g. "P2002") from an unknown error. */
function prismaErrorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }

  return null;
}

function getLocalParts(
  date: Date,
  timezone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);

    const value = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value);

    const result = {
      year: value("year"),
      month: value("month"),
      day: value("day"),
      hour: value("hour"),
      minute: value("minute"),
      second: value("second"),
    };

    if (Object.values(result).some((part) => !Number.isFinite(part))) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

function localDateString(date: Date, timezone: string): string | null {
  const parts = getLocalParts(date, timezone);

  if (!parts) {
    return null;
  }

  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function addCalendarDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);

  const date = new Date(
    Date.UTC(year, month - 1, day + days),
  );

  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function weekdayForDate(dateString: string): Weekday {
  const [year, month, day] = dateString.split("-").map(Number);

  return WEEKDAYS[
    new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  ];
}

/**
 * Converts a local calendar date and minute-of-day into a UTC instant.
 * Returns null when the requested local time does not exist, such as
 * during a daylight-saving clock change.
 */
function localTimeToUtc(
  dateString: string,
  minuteOfDay: number,
  timezone: string,
): Date | null {
  const [year, month, day] = dateString.split("-").map(Number);

  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;

  const targetTimestamp = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    0,
    0,
  );

  let guess = targetTimestamp;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const parts = getLocalParts(new Date(guess), timezone);

    if (!parts) {
      return null;
    }

    const representedTimestamp = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      0,
    );

    const correctedGuess =
      guess + (targetTimestamp - representedTimestamp);

    if (correctedGuess === guess) {
      break;
    }

    guess = correctedGuess;
  }

  const result = new Date(guess);
  const verified = getLocalParts(result, timezone);

  if (
    !verified ||
    verified.year !== year ||
    verified.month !== month ||
    verified.day !== day ||
    verified.hour !== hour ||
    verified.minute !== minute ||
    verified.second !== 0 ||
    result.getUTCMilliseconds() !== 0
  ) {
    return null;
  }

  return result;
}

function matchesAvailability(
  start: Date,
  durationMinutes: number,
  availability: {
    day: Weekday;
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

  const parts = getLocalParts(start, availability.timezone);

  if (!parts || parts.second !== 0) {
    return false;
  }

  const dateString = [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");

  return (
    weekdayForDate(dateString) === availability.day &&
    parts.hour * 60 + parts.minute === availability.startMinute
  );
}

function formatLocalClock(date: Date, timezone: string): string | null {
  const parts = getLocalParts(date, timezone);

  if (!parts) {
    return null;
  }

  return (
    `${String(parts.hour).padStart(2, "0")}:` +
    `${String(parts.minute).padStart(2, "0")}`
  );
}

async function getStudent(userId: string) {
  return prisma.studentProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      status: true,
    },
  });
}

async function getBookingRequest(
  requestId: string,
  studentProfileId: string,
) {
  return prisma.mateRequest.findFirst({
    where: {
      id: requestId,
      studentProfileId,
    },
    select: bookingRequestSelect,
  });
}

function unavailableResponse() {
  return NextResponse.json(
    { error: "This request is not available for booking." },
    { status: 409 },
  );
}

/**
 * GET /api/student/mate-requests/[requestId]/booking
 *
 * Lists available slots for an accepted request for the next 30 days.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be signed in to book a session." },
        { status: 401 },
      );
    }

    const { requestId } = await params;

    if (!requestId?.trim() || requestId.length > 100) {
      return NextResponse.json(
        { error: "A valid request ID is required." },
        { status: 400 },
      );
    }

    const student = await getStudent(session.user.id);

    if (!student) {
      return NextResponse.json(
        { error: "Student profile not found." },
        { status: 404 },
      );
    }

    if (student.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Your student account is not active." },
        { status: 403 },
      );
    }

    const bookingRequest = await getBookingRequest(
      requestId,
      student.id,
    );

    if (!bookingRequest) {
      return NextResponse.json(
        { error: "Request not found." },
        { status: 404 },
      );
    }

    if (
      bookingRequest.status !== "ACCEPTED" ||
      bookingRequest.tutoringSession
    ) {
      return unavailableResponse();
    }

    const { offering } = bookingRequest;
    const academicMate = offering.academicMateProfile;

    if (
      offering.status !== "ACTIVE" ||
      !offering.course.isActive ||
      academicMate.status !== "ACTIVE" ||
      academicMate.verificationStatus !== "VERIFIED" ||
      academicMate.userId === session.user.id
    ) {
      return NextResponse.json(
        { error: "This offering is no longer available." },
        { status: 409 },
      );
    }

    const now = new Date();

    const horizonEnd = new Date(now);
    horizonEnd.setUTCDate(
      horizonEnd.getUTCDate() + BOOKING_WINDOW_DAYS + 2,
    );

    const availability = await prisma.mateAvailability.findMany({
      where: {
        academicMateProfileId: academicMate.id,
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

    const candidateSlots = new Map<
      string,
      {
        start: Date;
        end: Date;
        timezone: string;
      }
    >();

    for (const window of availability) {
      const today = localDateString(now, window.timezone);

      if (!today) {
        continue;
      }

      if (
        window.endMinute - window.startMinute !==
        offering.sessionDurationMinutes
      ) {
        continue;
      }

      for (
        let dayOffset = 0;
        dayOffset <= BOOKING_WINDOW_DAYS;
        dayOffset += 1
      ) {
        const localDate = addCalendarDays(today, dayOffset);

        if (weekdayForDate(localDate) !== window.day) {
          continue;
        }

        const start = localTimeToUtc(
          localDate,
          window.startMinute,
          window.timezone,
        );

        if (!start || start <= now) {
          continue;
        }

        const end = new Date(
          start.getTime() +
            offering.sessionDurationMinutes * 60_000,
        );

        candidateSlots.set(start.toISOString(), {
          start,
          end,
          timezone: window.timezone,
        });
      }
    }

    const candidates = [...candidateSlots.values()];

    if (candidates.length === 0) {
      return NextResponse.json({ slots: [] });
    }

    const conflictingSessions = await prisma.tutoringSession.findMany({
      where: {
        status: { in: [...ACTIVE_SESSION_STATUSES] },
        scheduledStart: { lt: horizonEnd },
        scheduledEnd: { gt: now },
        request: {
          is: {
            OR: [
              { studentProfileId: student.id },
              {
                offering: {
                  is: {
                    academicMateProfileId: academicMate.id,
                  },
                },
              },
            ],
          },
        },
      },
      select: {
        scheduledStart: true,
        scheduledEnd: true,
      },
    });

    const slots = candidates
      .filter(
        (candidate) =>
          !conflictingSessions.some(
            (existing) =>
              candidate.start < existing.scheduledEnd &&
              candidate.end > existing.scheduledStart,
          ),
      )
      .sort(
        (a, b) => a.start.getTime() - b.start.getTime(),
      )
      .map((candidate) => ({
        start: candidate.start.toISOString(),
        end: candidate.end.toISOString(),
        timezone: candidate.timezone,
        localDate: localDateString(
          candidate.start,
          candidate.timezone,
        ),
        localStart: formatLocalClock(
          candidate.start,
          candidate.timezone,
        ),
        localEnd: formatLocalClock(
          candidate.end,
          candidate.timezone,
        ),
      }));

    return NextResponse.json({ slots });
  } catch (error) {
    console.error(
      "GET /api/student/mate-requests/[requestId]/booking failed:",
      error,
    );

    return NextResponse.json(
      { error: "Unable to load available booking slots." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/student/mate-requests/[requestId]/booking
 *
 * Books an available slot, creates its conversation, and notifies both
 * participants. PostgreSQL advisory transaction locks serialize booking
 * attempts involving the same student or Academic Mate.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be signed in to book a session." },
        { status: 401 },
      );
    }

    const { requestId } = await params;

    if (!requestId?.trim() || requestId.length > 100) {
      return NextResponse.json(
        { error: "A valid request ID is required." },
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
      Object.keys(body).some((key) => key !== "scheduledStart")
    ) {
      return NextResponse.json(
        {
          error:
            'Provide only "scheduledStart" as an ISO 8601 date-time.',
        },
        { status: 400 },
      );
    }

    if (
      typeof body.scheduledStart !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        body.scheduledStart,
      )
    ) {
      return NextResponse.json(
        {
          error:
            '"scheduledStart" must be an ISO 8601 date-time with a timezone.',
        },
        { status: 400 },
      );
    }

    const scheduledStart = new Date(body.scheduledStart);

    if (!Number.isFinite(scheduledStart.getTime())) {
      return NextResponse.json(
        { error: "The selected start time is invalid." },
        { status: 400 },
      );
    }

    if (scheduledStart <= new Date()) {
      return NextResponse.json(
        { error: "A session must be booked for a future time." },
        { status: 400 },
      );
    }

    const student = await getStudent(session.user.id);

    if (!student) {
      return NextResponse.json(
        { error: "Student profile not found." },
        { status: 404 },
      );
    }

    if (student.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Your student account is not active." },
        { status: 403 },
      );
    }

    const initialRequest = await getBookingRequest(
      requestId,
      student.id,
    );

    if (!initialRequest) {
      return NextResponse.json(
        { error: "Request not found." },
        { status: 404 },
      );
    }

    if (
      initialRequest.status !== "ACCEPTED" ||
      initialRequest.tutoringSession
    ) {
      return unavailableResponse();
    }

    const academicMateId =
      initialRequest.offering.academicMateProfile.id;

    if (
      initialRequest.offering.academicMateProfile.userId ===
      session.user.id
    ) {
      return NextResponse.json(
        { error: "You cannot book a session with yourself." },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(
      async (tx) => {
        /*
         * Acquire locks in a stable order to avoid deadlocks.
         * Both identities are locked before checking for conflicts.
         *
         * $executeRaw is used (not $queryRaw) because
         * pg_advisory_xact_lock() returns `void`, which the Prisma
         * driver adapter cannot deserialize as a result column.
         * The locks are released automatically on commit or rollback.
         */
        const lockKeys = [
          `student:${student.id}`,
          `academic-mate:${academicMateId}`,
        ].sort();

        for (const lockKey of lockKeys) {
          await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(
              hashtextextended(${lockKey}, 0)
            )
          `;
        }

        /*
         * Reload the request after obtaining the locks so that a
         * concurrent booking or request-status change is observed
         * before writing.
         */
        const currentRequest = await tx.mateRequest.findFirst({
          where: {
            id: requestId,
            studentProfileId: student.id,
          },
          select: bookingRequestSelect,
        });

        if (!currentRequest) {
          return { kind: "not-found" as const };
        }

        if (currentRequest.status !== "ACCEPTED") {
          return { kind: "not-accepted" as const };
        }

        if (currentRequest.tutoringSession) {
          return { kind: "already-booked" as const };
        }

        const currentStudent = currentRequest.studentProfile;
        const offering = currentRequest.offering;
        const academicMate = offering.academicMateProfile;

        if (
          currentStudent.status !== "ACTIVE" ||
          offering.status !== "ACTIVE" ||
          !offering.course.isActive ||
          academicMate.status !== "ACTIVE" ||
          academicMate.verificationStatus !== "VERIFIED" ||
          academicMate.id !== academicMateId ||
          academicMate.userId === session.user.id
        ) {
          return { kind: "offering-unavailable" as const };
        }

        const now = new Date();

        if (scheduledStart <= now) {
          return { kind: "past-time" as const };
        }

        const availability = await tx.mateAvailability.findMany({
          where: {
            academicMateProfileId: academicMate.id,
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

        const matchingAvailability = availability.find((window) =>
          matchesAvailability(
            scheduledStart,
            offering.sessionDurationMinutes,
            window,
          ),
        );

        if (!matchingAvailability) {
          return { kind: "invalid-slot" as const };
        }

        const scheduledEnd = new Date(
          scheduledStart.getTime() +
            offering.sessionDurationMinutes * 60_000,
        );

        /*
         * The advisory locks ensure that another booking through this
         * endpoint involving either participant cannot pass this check
         * concurrently.
         */
        const conflictingSession =
          await tx.tutoringSession.findFirst({
            where: {
              status: { in: [...ACTIVE_SESSION_STATUSES] },
              scheduledStart: { lt: scheduledEnd },
              scheduledEnd: { gt: scheduledStart },
              request: {
                is: {
                  OR: [
                    { studentProfileId: student.id },
                    {
                      offering: {
                        is: {
                          academicMateProfileId: academicMate.id,
                        },
                      },
                    },
                  ],
                },
              },
            },
            select: {
              id: true,
            },
          });

        if (conflictingSession) {
          return { kind: "conflict" as const };
        }

        const createdSession = await tx.tutoringSession.create({
          data: {
            requestId: currentRequest.id,
            scheduledStart,
            scheduledEnd,
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

        const conversation = await tx.conversation.create({
          data: {
            requestId: currentRequest.id,
          },
          select: {
            id: true,
          },
        });

        await tx.notification.createMany({
          data: [
            {
              userId: currentStudent.userId,
              type: "SESSION_SCHEDULED",
              title: "Tutoring session booked",
              body:
                "Your tutoring session is booked. Open TXMate to view the session details.",
              data: {
                requestId: currentRequest.id,
                sessionId: createdSession.id,
                conversationId: conversation.id,
                scheduledStart: scheduledStart.toISOString(),
              },
            },
            {
              userId: academicMate.userId,
              type: "SESSION_SCHEDULED",
              title: "Tutoring session booked",
              body:
                "A student has booked a tutoring session with you. Open TXMate to view the session details.",
              data: {
                requestId: currentRequest.id,
                sessionId: createdSession.id,
                conversationId: conversation.id,
                scheduledStart: scheduledStart.toISOString(),
              },
            },
          ],
        });

        return {
          kind: "created" as const,
          session: createdSession,
          conversationId: conversation.id,
        };
      },
      {
        maxWait: 5_000, // max time to acquire a connection from the pool
        timeout: 15_000, // max time the transaction may run
      },
    );

    switch (result.kind) {
      case "not-found":
        return NextResponse.json(
          { error: "Request not found." },
          { status: 404 },
        );

      case "not-accepted":
      case "already-booked":
        return unavailableResponse();

      case "offering-unavailable":
        return NextResponse.json(
          { error: "This offering is no longer available." },
          { status: 409 },
        );

      case "past-time":
        return NextResponse.json(
          { error: "A session must be booked for a future time." },
          { status: 400 },
        );

      case "invalid-slot":
        return NextResponse.json(
          {
            error:
              "The selected time does not match the Academic Mate's current availability.",
          },
          { status: 409 },
        );

      case "conflict":
        return NextResponse.json(
          {
            error:
              "You or the Academic Mate already has a session during that time. Select another slot.",
          },
          { status: 409 },
        );

      case "created":
        return NextResponse.json(
          {
            message: "Session booked successfully.",
            session: {
              ...result.session,
              scheduledStart:
                result.session.scheduledStart.toISOString(),
              scheduledEnd:
                result.session.scheduledEnd.toISOString(),
            },
            conversationId: result.conversationId,
          },
          { status: 201 },
        );
    }
  } catch (error) {
    const code = prismaErrorCode(error);

    // Unique constraint hit: another booking for this request got in first.
    if (code === "P2002") {
      return NextResponse.json(
        { error: "This request has already been booked." },
        { status: 409 },
      );
    }

    // Transaction conflict, deadlock, or timeout: safe for the client to retry.
    if (code === "P2034" || code === "P2028") {
      return NextResponse.json(
        { error: "The booking system is busy. Please try again." },
        { status: 503 },
      );
    }

    console.error(
      "POST /api/student/mate-requests/[requestId]/booking failed:",
      error,
    );

    return NextResponse.json(
      { error: "Unable to book this session." },
      { status: 500 },
    );
  }
}