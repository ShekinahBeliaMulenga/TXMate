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

/**
 * Ends a recurring tutoring arrangement. This is deliberately separate from
 * the session cancellation route, which cancels only one occurrence.
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const authSession = await auth.api.getSession({ headers: await headers() });
    if (!authSession?.user) {
      return NextResponse.json({ error: "You must be signed in to cancel a tutoring arrangement." }, { status: 401 });
    }

    const { sessionId } = await params;
    if (!sessionId?.trim() || sessionId.length > 100) {
      return NextResponse.json({ error: "A valid session ID is required." }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must contain valid JSON." }, { status: 400 });
    }
    if (
      !isPlainObject(body) ||
      Object.keys(body).some((key) => key !== "reason") ||
      (body.reason !== undefined && typeof body.reason !== "string")
    ) {
      return NextResponse.json({ error: 'Provide an optional string field named "reason".' }, { status: 400 });
    }

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length > 500) {
      return NextResponse.json({ error: "The cancellation reason cannot exceed 500 characters." }, { status: 400 });
    }

    const selectedSession = await prisma.tutoringSession.findUnique({
      where: { id: sessionId },
      select: {
        arrangementId: true,
        request: {
          select: {
            id: true,
            status: true,
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
                title: true,
                course: { select: { name: true } },
                academicMateProfile: {
                  select: {
                    id: true,
                    userId: true,
                    user: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!selectedSession) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const arrangement = selectedSession.request;
    const student = arrangement.studentProfile;
    const mate = arrangement.offering.academicMateProfile;
    const actorId = authSession.user.id;
    if (actorId !== student.userId && actorId !== mate.userId) {
      return NextResponse.json({ error: "You are not authorised to cancel this tutoring arrangement." }, { status: 403 });
    }
    if (arrangement.arrangementType !== "RECURRING") {
      return NextResponse.json({ error: "This action is only for recurring tutoring arrangements. Cancel the individual session instead." }, { status: 409 });
    }
    if (arrangement.arrangementStatus !== "ACTIVE" && arrangement.arrangementStatus !== "PAUSED") {
      return NextResponse.json({ error: "Only an active or paused recurring arrangement can be cancelled." }, { status: 409 });
    }

    const now = new Date();
    const actorName = authSession.user.name || (actorId === student.userId ? "the student" : "the Academic Mate");
    const courseName = arrangement.offering.title || arrangement.offering.course.name;
    const storedReason = reason || null;

    const result = await prisma.$transaction(async (tx) => {
      // Share lock ordering with booking and recurring generation to avoid races.
      const lockKeys = [`student:${student.id}`, `academic-mate:${mate.id}`].sort();
      for (const lockKey of lockKeys) {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
        `;
      }

      const current = await tx.mateRequest.findUnique({
        where: { id: arrangement.id },
        select: { id: true, status: true, arrangementType: true, arrangementStatus: true },
      });
      if (
        !current ||
        current.arrangementType !== "RECURRING" ||
        current.status !== "ACCEPTED" ||
        (current.arrangementStatus !== "ACTIVE" && current.arrangementStatus !== "PAUSED")
      ) {
        return { kind: "changed" as const };
      }

      const claimed = await tx.mateRequest.updateMany({
        where: {
          id: current.id,
          status: "ACCEPTED",
          arrangementType: "RECURRING",
          arrangementStatus: { in: ["ACTIVE", "PAUSED"] },
        },
        data: {
          status: "CANCELLED",
          arrangementStatus: "CANCELLED",
          respondedAt: now,
          arrangementCancelledAt: now,
          arrangementCancelledByUserId: actorId,
          arrangementCancellationReason: storedReason,
        },
      });
      if (claimed.count !== 1) return { kind: "changed" as const };

      const sessionRows = await tx.tutoringSession.findMany({
        where: { arrangementId: current.id },
        select: { id: true },
      });
      const sessionIds = sessionRows.map((item) => item.id);

      // Only cancel future sessions that have not started. Historical and in-progress
      // records are preserved; cancelled occurrences remain cancelled.
      const cancelledSessions = await tx.tutoringSession.updateMany({
        where: {
          arrangementId: current.id,
          status: "SCHEDULED",
          scheduledStart: { gt: now },
        },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancellationReason: `Arrangement cancelled by ${actorName}${reason ? `: ${reason}` : "."}`.slice(0, 500),
        },
      });

      if (sessionIds.length > 0) {
        await tx.sessionRescheduleRequest.updateMany({
          where: { sessionId: { in: sessionIds }, status: "PENDING" },
          data: { status: "CANCELLED", respondedAt: now },
        });
      }

      const notificationBody = `${actorName} cancelled the recurring tutoring arrangement for ${courseName}. Upcoming sessions have been cancelled. Past records and the shared conversation history have been preserved.`;
      await tx.notification.createMany({
        data: [
          {
            userId: student.userId,
            type: "SYSTEM",
            title: "Recurring tutoring arrangement cancelled",
            body: notificationBody,
            data: {
              requestId: current.id,
              cancelledAt: now.toISOString(),
              cancelledByUserId: actorId,
              reason: storedReason,
              upcomingSessionsCancelled: cancelledSessions.count,
            },
          },
          {
            userId: mate.userId,
            type: "SYSTEM",
            title: "Recurring tutoring arrangement cancelled",
            body: notificationBody,
            data: {
              requestId: current.id,
              cancelledAt: now.toISOString(),
              cancelledByUserId: actorId,
              reason: storedReason,
              upcomingSessionsCancelled: cancelledSessions.count,
            },
          },
        ],
      });

      return { kind: "cancelled" as const, upcomingSessionsCancelled: cancelledSessions.count };
    }, { maxWait: 10_000, timeout: 15_000 });

    if (result.kind === "changed") {
      return NextResponse.json({ error: "The arrangement changed or was already cancelled. Refresh and try again." }, { status: 409 });
    }

    return NextResponse.json({
      message: `The recurring tutoring arrangement has been cancelled. ${result.upcomingSessionsCancelled} upcoming session${result.upcomingSessionsCancelled === 1 ? " was" : "s were"} cancelled, and both participants have been notified.`,
      arrangement: { id: arrangement.id, status: "CANCELLED", cancelledAt: now.toISOString() },
      upcomingSessionsCancelled: result.upcomingSessionsCancelled,
    });
  } catch (error) {
    console.error("POST session cancel-arrangement failed:", error);
    return NextResponse.json({ error: "Unable to cancel the recurring tutoring arrangement." }, { status: 500 });
  }
}
