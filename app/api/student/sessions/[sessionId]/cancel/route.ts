import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const authSession = await auth.api.getSession({
      headers: await headers(),
    });

    if (!authSession?.user) {
      return NextResponse.json(
        { error: "You must be signed in to cancel a session." },
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
      Object.keys(body).some((key) => key !== "reason") ||
      (body.reason !== undefined && typeof body.reason !== "string")
    ) {
      return NextResponse.json(
        { error: 'Provide an optional string field named "reason".' },
        { status: 400 },
      );
    }

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (reason.length > 500) {
      return NextResponse.json(
        { error: "The cancellation reason cannot exceed 500 characters." },
        { status: 400 },
      );
    }

    const booking = await prisma.tutoringSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        requestId: true,
        status: true,
        scheduledStart: true,
        request: {
          select: {
            status: true,
            studentProfile: {
              select: {
                userId: true,
                user: { select: { name: true } },
              },
            },
            offering: {
              select: {
                title: true,
                course: { select: { name: true } },
                academicMateProfile: {
                  select: { userId: true },
                },
              },
            },
          },
        },
      },
    });

    if (!booking) {
      return NextResponse.json(
        { error: "Session not found." },
        { status: 404 },
      );
    }

    const student = booking.request.studentProfile;
    const mate = booking.request.offering.academicMateProfile;

    if (student.userId !== authSession.user.id) {
      return NextResponse.json(
        {
          error: "Only the student who booked this session can cancel it.",
        },
        { status: 403 },
      );
    }

    if (booking.status !== "SCHEDULED") {
      return NextResponse.json(
        {
          error:
            "Only scheduled sessions can be cancelled. Refresh to see the current status.",
        },
        { status: 409 },
      );
    }

    const now = new Date();

    if (booking.scheduledStart <= now) {
      return NextResponse.json(
        {
          error:
            "This session can no longer be cancelled because its scheduled start time has arrived.",
        },
        { status: 409 },
      );
    }

    const courseName =
      booking.request.offering.title ||
      booking.request.offering.course.name;

    const notificationData = {
      sessionId: booking.id,
      requestId: booking.requestId,
      courseName,
      cancelledAt: now.toISOString(),
    };

    const cancelled = await prisma.$transaction(
      async (tx) => {
        const updated = await tx.tutoringSession.updateMany({
          where: {
            id: booking.id,
            status: "SCHEDULED",
            scheduledStart: { gt: now },
          },
          data: {
            status: "CANCELLED",
            cancelledAt: now,
            cancellationReason: reason || null,
          },
        });

        if (updated.count !== 1) {
          return false;
        }

        await tx.mateRequest.updateMany({
          where: {
            id: booking.requestId,
            status: "ACCEPTED",
          },
          data: {
            status: "CANCELLED",
            respondedAt: now,
          },
        });

        await tx.sessionRescheduleRequest.updateMany({
          where: {
            sessionId: booking.id,
            status: "PENDING",
          },
          data: {
            status: "CANCELLED",
            respondedAt: now,
          },
        });

        await tx.notification.createMany({
          data: [
            {
              userId: student.userId,
              type: "SESSION_CANCELLED",
              title: "Tutoring session cancelled",
              body: `Your session for ${courseName} has been cancelled. You can submit a new request to arrange another session.`,
              data: notificationData,
            },
            {
              userId: mate.userId,
              type: "SESSION_CANCELLED",
              title: "Tutoring session cancelled",
              body: `${student.user.name} cancelled the session for ${courseName}. The student must submit a new request before another session can be booked.`,
              data: notificationData,
            },
          ],
        });

        return true;
      },
      { maxWait: 10_000, timeout: 15_000 },
    );

    if (!cancelled) {
      return NextResponse.json(
        {
          error:
            "The session has changed and could not be cancelled. Refresh and try again.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      message:
        "The session and its original request have been cancelled. Both participants have been notified. You can submit a new request to arrange another session.",
      session: {
        id: booking.id,
        status: "CANCELLED" as const,
        cancelledAt: now.toISOString(),
        cancellationReason: reason || null,
      },
      request: {
        id: booking.requestId,
        status: "CANCELLED" as const,
      },
    });
  } catch (error) {
    console.error(
      "POST /api/student/sessions/[sessionId]/cancel failed:",
      error,
    );

    return NextResponse.json(
      { error: "Unable to cancel this session." },
      { status: 500 },
    );
  }
}