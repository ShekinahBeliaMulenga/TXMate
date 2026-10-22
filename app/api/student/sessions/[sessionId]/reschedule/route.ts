
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getScheduleConflictingStarts, hasScheduleConflict } from "@/lib/recurring-arrangement-conflicts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

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

function getLocalParts(date: Date, timezone: string) {
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
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const result = { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
    return Object.values(result).every(Number.isFinite) ? result : null;
  } catch {
    return null;
  }
}

function localDateString(date: Date, timezone: string): string | null {
  const p = getLocalParts(date, timezone);
  return p ? `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}` : null;
}

function addCalendarDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function weekdayForDate(dateString: string): (typeof WEEKDAYS)[number] {
  const [year, month, day] = dateString.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

function localTimeToUtc(dateString: string, minuteOfDay: number, timezone: string): Date | null {
  const [year, month, day] = dateString.split("-").map(Number);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let i = 0; i < 6; i++) {
    const p = getLocalParts(new Date(guess), timezone);
    if (!p) return null;
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const corrected = guess + target - represented;
    if (corrected === guess) break;
    guess = corrected;
  }
  const result = new Date(guess);
  const p = getLocalParts(result, timezone);
  if (!p || p.year !== year || p.month !== month || p.day !== day || p.hour !== hour || p.minute !== minute || p.second !== 0 || result.getUTCMilliseconds() !== 0) return null;
  return result;
}

function formatLocalClock(date: Date, timezone: string): string | null {
  const p = getLocalParts(date, timezone);
  return p ? `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}` : null;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const authSession = await auth.api.getSession({ headers: await headers() });
    if (!authSession?.user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

    const { sessionId } = await params;
    if (!sessionId?.trim() || sessionId.length > 100) return NextResponse.json({ error: "A valid session ID is required." }, { status: 400 });

    const existing = await prisma.tutoringSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        arrangementId: true,
        status: true,
        scheduledStart: true,
        occurrenceSlotStart: true,
        request: {
          select: {
            arrangementType: true,
            arrangementStatus: true,
            studentProfile: { select: { id: true, userId: true, status: true } },
            offering: {
              select: {
                id: true,
                status: true,
                sessionDurationMinutes: true,
                course: { select: { isActive: true } },
                academicMateProfile: { select: { id: true, userId: true, status: true, verificationStatus: true } },
              },
            },
          },
        },
      },
    });

    if (!existing) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    const student = existing.request.studentProfile;
    const offering = existing.request.offering;
    const mate = offering.academicMateProfile;
    const userId = authSession.user.id;

    if (userId !== student.userId && userId !== mate.userId) return NextResponse.json({ error: "You are not a participant in this session." }, { status: 403 });

    const now = new Date();
    const activeArrangement = existing.request.arrangementStatus === "ACTIVE";
    const reversibleOneTimeCancellation =
      existing.request.arrangementType === "ONE_TIME" &&
      existing.request.arrangementStatus === "CANCELLED" &&
      existing.status === "CANCELLED";
    const canRescheduleStatus = existing.status === "SCHEDULED" || existing.status === "CANCELLED";
    if (!(activeArrangement || reversibleOneTimeCancellation) || !canRescheduleStatus || existing.scheduledStart <= now) {
      return NextResponse.json({ error: "Only a future scheduled session, or a cancelled session before its original start time, can be rescheduled." }, { status: 409 });
    }
    if (student.status !== "ACTIVE" || offering.status !== "ACTIVE" || !offering.course.isActive || mate.status !== "ACTIVE" || mate.verificationStatus !== "VERIFIED") return NextResponse.json({ error: "The student, offering, or Academic Mate is no longer eligible for rescheduling." }, { status: 409 });

    const pending = await prisma.sessionRescheduleRequest.findFirst({ where: { sessionId, status: "PENDING" }, select: { id: true } });
    if (pending) return NextResponse.json({ error: "A rescheduling proposal is already awaiting a response." }, { status: 409 });
    const duration = offering.sessionDurationMinutes;
    const availability = await prisma.mateAvailability.findMany({
      where: { academicMateProfileId: mate.id, mateOfferingId: offering.id, isActive: true },
      select: { day: true, startMinute: true, endMinute: true, timezone: true },
    });
    const candidateSlots = new Map<string, { start: Date; end: Date; timezone: string }>();

    for (const window of availability) {
      if (window.endMinute - window.startMinute !== duration) continue;
      const today = localDateString(now, window.timezone);
      if (!today) continue;
      for (let offset = 0; offset <= 30; offset++) {
        const localDate = addCalendarDays(today, offset);
        if (weekdayForDate(localDate) !== window.day) continue;
        const start = localTimeToUtc(localDate, window.startMinute, window.timezone);
        if (!start || start <= now || start.getTime() === existing.scheduledStart.getTime()) continue;
        const end = new Date(start.getTime() + duration * 60_000);
        candidateSlots.set(start.toISOString(), { start, end, timezone: window.timezone });
      }
    }

    const candidates = [...candidateSlots.values()];
    if (!candidates.length) return NextResponse.json({ slots: [] });

    const [heldStarts, conflictingStarts] = await Promise.all([
      prisma.tutoringSession.findMany({
        where: {
          arrangementId: existing.arrangementId,
          id: { not: sessionId },
          scheduledStart: { in: candidates.map((slot) => slot.start) },
        },
        select: { scheduledStart: true },
      }),
      getScheduleConflictingStarts(prisma, {
        occurrenceStarts: candidates.map((slot) => slot.start),
        durationMinutes: duration,
        studentProfileId: student.id,
        academicMateProfileId: mate.id,
        excludeRequestId: existing.arrangementId,
        excludeSessionId: sessionId,
        includeExcludedRequestRecurrence: true,
        ignoreOccurrenceSlotStart: existing.occurrenceSlotStart,
      }),
    ]);
    const heldStartTimes = new Set(heldStarts.map((session) => session.scheduledStart.getTime()));

    const slots = candidates
      .filter((slot) => !heldStartTimes.has(slot.start.getTime()))
      .filter((slot) => !conflictingStarts.has(slot.start.getTime()))
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map((slot) => ({
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        timezone: slot.timezone,
        localDate: localDateString(slot.start, slot.timezone),
        localStart: formatLocalClock(slot.start, slot.timezone),
        localEnd: formatLocalClock(slot.end, slot.timezone),
      }));

    return NextResponse.json({ slots });
  } catch (error) {
    console.error("GET session reschedule slots failed:", error);
    return NextResponse.json({ error: "Unable to load available rescheduling slots." }, { status: 500 });
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
        arrangementId: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        request: {
          select: {
            arrangementType: true,
            arrangementStatus: true,
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

    const activeArrangement = existing.request.arrangementStatus === "ACTIVE";
    const reversibleOneTimeCancellation =
      existing.request.arrangementType === "ONE_TIME" &&
      existing.request.arrangementStatus === "CANCELLED" &&
      existing.status === "CANCELLED";
    if (!(activeArrangement || reversibleOneTimeCancellation)) {
      return NextResponse.json(
        { error: "This arrangement is not eligible for rescheduling." },
        { status: 409 },
      );
    }

    if (existing.status !== "SCHEDULED" && existing.status !== "CANCELLED") {
      return NextResponse.json(
        { error: "Only scheduled or cancelled future sessions can be rescheduled." },
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
          arrangementId: true,
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          occurrenceSlotStart: true,
          request: { select: { arrangementType: true, arrangementStatus: true } },
        },
      });

      const currentArrangementActive = current?.request.arrangementStatus === "ACTIVE";
      const currentOneTimeCancelled =
        current?.request.arrangementType === "ONE_TIME" &&
        current.request.arrangementStatus === "CANCELLED" &&
        current.status === "CANCELLED";
      if (
        !current ||
        !(currentArrangementActive || currentOneTimeCancelled) ||
        (current.status !== "SCHEDULED" && current.status !== "CANCELLED") ||
        current.scheduledStart <= new Date() ||
        proposedStart <= new Date() ||
        proposedStart.getTime() === current.scheduledStart.getTime()
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

      // Rescheduling is a proposal, not an immediate booking. A participant may
      // propose a one-off time outside the published slots; the receiving
      // participant's explicit acceptance confirms that time works for them.
      // The time/overlap/duplicate checks below still apply before a proposal is saved.

      // The database also has a unique (arrangementId, scheduledStart) constraint.
      // Check all rows, including cancelled occurrences, so acceptance returns a useful
      // conflict instead of surfacing a database uniqueness error.
      const slotHeld = await tx.tutoringSession.findFirst({
        where: {
          arrangementId: current.arrangementId,
          id: { not: sessionId },
          scheduledStart: proposedStart,
        },
        select: { id: true },
      });
      if (slotHeld) return { kind: "slot-held" as const };

      const conflict = await hasScheduleConflict(tx, {
        occurrenceStarts: [proposedStart],
        durationMinutes,
        studentProfileId: student.id,
        academicMateProfileId: mate.id,
        excludeRequestId: current.arrangementId,
        excludeSessionId: sessionId,
        includeExcludedRequestRecurrence: true,
        ignoreOccurrenceSlotStart: current.occurrenceSlotStart,
      });

      if (conflict) return { kind: "conflict" as const };

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

    if (result.kind === "slot-held") {
      return NextResponse.json(
        { error: "Another occurrence in this tutoring arrangement already uses that exact start time. Choose a different available slot." },
        { status: 409 },
      );
    }

    if (result.kind === "conflict") {
      return NextResponse.json(
        {
          error:
            "The student has another session or pending recurring occurrence during that time.",
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
