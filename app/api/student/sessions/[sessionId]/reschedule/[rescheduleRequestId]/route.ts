
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasScheduleConflict } from "@/lib/recurring-arrangement-conflicts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    sessionId: string;
    rescheduleRequestId: string;
  }>;
};

export async function PATCH(
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

    const { sessionId, rescheduleRequestId } = await params;

    if (
      !sessionId?.trim() ||
      sessionId.length > 100 ||
      !rescheduleRequestId?.trim() ||
      rescheduleRequestId.length > 100
    ) {
      return NextResponse.json(
        { error: "Valid session and proposal IDs are required." },
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
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !("action" in body) ||
      (body.action !== "ACCEPTED" &&
        body.action !== "DECLINED")
    ) {
      return NextResponse.json(
        { error: 'The action must be "ACCEPTED" or "DECLINED".' },
        { status: 400 },
      );
    }

    const action = body.action;
    const userId = authSession.user.id;

    const proposal =
      await prisma.sessionRescheduleRequest.findFirst({
        where: {
          id: rescheduleRequestId,
          sessionId,
        },
        select: {
          id: true,
          status: true,
          respondingUserId: true,
          proposedStart: true,
          proposedEnd: true,
          session: {
            select: {
              id: true,
              arrangementId: true,
              status: true,
              scheduledStart: true,
              occurrenceSlotStart: true,
              request: {
                select: {
                  status: true,
                  arrangementType: true,
                  arrangementStatus: true,
                  studentProfile: {
                    select: {
                      id: true,
                      userId: true,
                      user: {
                        select: { name: true },
                      },
                    },
                  },
                  offering: {
                    select: {
                      id: true,
                      sessionDurationMinutes: true,
                      title: true,
                      course: {
                        select: { code: true, name: true },
                      },
                      academicMateProfile: {
                        select: {
                          id: true,
                          userId: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

    if (!proposal) {
      return NextResponse.json(
        { error: "Rescheduling proposal not found." },
        { status: 404 },
      );
    }

    if (proposal.respondingUserId !== userId) {
      return NextResponse.json(
        {
          error:
            "Only the participant receiving this proposal can respond.",
        },
        { status: 403 },
      );
    }

    if (proposal.status === "EXPIRED") {
      const now = new Date();
      const errorMessage =
        proposal.session.scheduledStart <= now
          ? "The original session's scheduled start time has passed. This proposal has expired, and the session was not moved."
          : proposal.proposedStart <= now
            ? "The proposed replacement time has passed. This proposal has expired, and the session was not moved."
            : "This rescheduling proposal has expired or is no longer valid. The session was not moved.";

      return NextResponse.json({ error: errorMessage }, { status: 409 });
    }

    if (proposal.status !== "PENDING") {
      return NextResponse.json(
        {
          error:
            "This proposal has already been resolved. Refresh to see its status.",
        },
        { status: 409 },
      );
    }

    const student = proposal.session.request.studentProfile;
    const mate =
      proposal.session.request.offering.academicMateProfile;

    const result = await prisma.$transaction(
      async (tx) => {
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

        const current =
          await tx.sessionRescheduleRequest.findFirst({
            where: {
              id: rescheduleRequestId,
              sessionId,
            },
            select: {
              id: true,
              status: true,
              respondingUserId: true,
              proposedStart: true,
              proposedEnd: true,
              session: {
                select: {
                  id: true,
                  arrangementId: true,
                  status: true,
                  scheduledStart: true,
                  occurrenceSlotStart: true,
                  request: {
                    select: {
                      status: true,
                      arrangementType: true,
                      arrangementStatus: true,
                      offering: {
                        select: {
                          id: true,
                          sessionDurationMinutes: true,
                          academicMateProfile: { select: { id: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          });

        if (!current || current.respondingUserId !== userId) {
          return { kind: "proposal-changed" as const };
        }

        const now = new Date();

        if (current.status === "EXPIRED") {
          return current.session.scheduledStart <= now
            ? { kind: "original-deadline-passed" as const }
            : current.proposedStart <= now
              ? { kind: "time-expired" as const }
              : { kind: "proposal-changed" as const };
        }

        if (current.status !== "PENDING") {
          return { kind: "proposal-changed" as const };
        }

        const currentArrangementActive = current.session.request.arrangementStatus === "ACTIVE";
        const currentOneTimeCancelled =
          current.session.request.arrangementType === "ONE_TIME" &&
          current.session.request.arrangementStatus === "CANCELLED" &&
          current.session.request.status === "CANCELLED" &&
          current.session.status === "CANCELLED";
        if (current.session.scheduledStart <= now) {
          const expiredProposal = await tx.sessionRescheduleRequest.updateMany({
            where: {
              id: current.id,
              status: "PENDING",
            },
            data: {
              status: "EXPIRED",
              respondedAt: now,
            },
          });

          if (expiredProposal.count === 1) {
            const expirationMessage =
              "The original session start time has passed. The rescheduling proposal expired, and the session was not moved.";
            await tx.notification.createMany({
              data: [
                {
                  userId: student.userId,
                  type: "SYSTEM",
                  title: "Rescheduling proposal expired",
                  body: expirationMessage,
                  data: { sessionId, rescheduleRequestId },
                },
                {
                  userId: mate.userId,
                  type: "SYSTEM",
                  title: "Rescheduling proposal expired",
                  body: expirationMessage,
                  data: { sessionId, rescheduleRequestId },
                },
              ],
            });
          }

          return { kind: "original-deadline-passed" as const };
        }

        if (
          !(currentArrangementActive || currentOneTimeCancelled) ||
          (current.session.status !== "SCHEDULED" && current.session.status !== "CANCELLED")
        ) {
          await tx.sessionRescheduleRequest.updateMany({
            where: {
              id: current.id,
              status: "PENDING",
            },
            data: {
              status: "EXPIRED",
              respondedAt: now,
            },
          });

          return { kind: "session-unavailable" as const };
        }

        if (action === "DECLINED") {
          const declined =
            await tx.sessionRescheduleRequest.updateMany({
              where: {
                id: current.id,
                status: "PENDING",
              },
              data: {
                status: "DECLINED",
                respondedAt: now,
              },
            });

          if (declined.count !== 1) {
            return { kind: "proposal-changed" as const };
          }

          await tx.notification.createMany({
            data: [
              {
                userId: student.userId,
                type: "SYSTEM",
                title: "Rescheduling proposal declined",
                body:
                  "The proposed session time was declined. " +
                  "Your existing booking remains unchanged.",
                data: {
                  sessionId,
                  rescheduleRequestId,
                },
              },
              {
                userId: mate.userId,
                type: "SYSTEM",
                title: "Rescheduling proposal declined",
                body:
                  "The proposed session time was declined. " +
                  "Your existing booking remains unchanged.",
                data: {
                  sessionId,
                  rescheduleRequestId,
                },
              },
            ],
          });

          return { kind: "declined" as const };
        }

        // Acceptance is the other participant's explicit confirmation that the
        // proposed one-off time works. Published availability is used to suggest
        // slots, but does not prevent participants agreeing to an exception here.
        // We still validate the proposed time, same-student conflicts, and duplicates.

        if (current.proposedStart <= now) {
          await tx.sessionRescheduleRequest.updateMany({
            where: {
              id: current.id,
              status: "PENDING",
            },
            data: {
              status: "EXPIRED",
              respondedAt: now,
            },
          });

          return { kind: "time-expired" as const };
        }

        // A cancelled occurrence can still occupy the arrangement's unique scheduledStart key.
        // Guard it explicitly so the API reports a conflict instead of a Prisma error.
        const slotHeld = await tx.tutoringSession.findFirst({
          where: {
            arrangementId: current.session.arrangementId,
            id: { not: sessionId },
            scheduledStart: current.proposedStart,
          },
          select: { id: true },
        });
        if (slotHeld) return { kind: "slot-held" as const };

        const conflict = await hasScheduleConflict(tx, {
          occurrenceStarts: [current.proposedStart],
          durationMinutes: current.session.request.offering.sessionDurationMinutes,
          studentProfileId: student.id,
          academicMateProfileId: mate.id,
          excludeRequestId: current.session.arrangementId,
          excludeSessionId: sessionId,
          includeExcludedRequestRecurrence: true,
          ignoreOccurrenceSlotStart: current.session.occurrenceSlotStart,
        });

        if (conflict) return { kind: "conflict" as const };

        if (currentOneTimeCancelled) {
          const competingArrangement = await tx.mateRequest.findFirst({
            where: {
              id: { not: current.session.arrangementId },
              studentProfileId: student.id,
              offeringId: current.session.request.offering.id,
              status: { in: ["REQUESTED", "ACCEPTED"] },
            },
            select: { id: true },
          });
          if (competingArrangement) return { kind: "arrangement-exists" as const };
        }

        const updatedSession =
          await tx.tutoringSession.updateMany({
            where: {
              id: sessionId,
              status: { in: ["SCHEDULED", "CANCELLED"] },
              scheduledStart: { gt: now },
            },
            data: {
              status: "SCHEDULED",
              scheduledStart: current.proposedStart,
              scheduledEnd: current.proposedEnd,
              cancelledAt: null,
              cancellationReason: null,
              reminderSentAt: null,
            },
          });

        if (updatedSession.count !== 1) {
          return { kind: "session-changed" as const };
        }

        const accepted =
          await tx.sessionRescheduleRequest.updateMany({
            where: {
              id: current.id,
              status: "PENDING",
            },
            data: {
              status: "ACCEPTED",
              respondedAt: now,
            },
          });

        if (accepted.count !== 1) {
          throw new Error(
            "Proposal changed during acceptance.",
          );
        }

        if (currentOneTimeCancelled) {
          const restoredArrangement = await tx.mateRequest.updateMany({
            where: {
              id: current.session.arrangementId,
              arrangementType: "ONE_TIME",
              status: "CANCELLED",
              arrangementStatus: "CANCELLED",
            },
            data: {
              status: "ACCEPTED",
              arrangementStatus: "ACTIVE",
              respondedAt: now,
            },
          });
          if (restoredArrangement.count !== 1) {
            throw new Error("The one-time arrangement could not be restored after rescheduling.");
          }
        }

        // Any other outstanding proposals for this session
        // can no longer be accepted.
        await tx.sessionRescheduleRequest.updateMany({
          where: {
            sessionId,
            id: { not: current.id },
            status: "PENDING",
          },
          data: {
            status: "CANCELLED",
            respondedAt: now,
          },
        });

        const course = proposal.session.request.offering.course;
        const courseName = course.code ? `${course.code} · ${course.name}` : course.name;

        await tx.notification.createMany({
          data: [
            {
              userId: student.userId,
              type: "SESSION_SCHEDULED",
              title: "Session time updated",
              body:
                `Your session for ${courseName} has been rescheduled. ` +
                "Open TXMate to view the updated time.",
              data: {
                sessionId,
                rescheduleRequestId,
                scheduledStart:
                  current.proposedStart.toISOString(),
                scheduledEnd:
                  current.proposedEnd.toISOString(),
              },
            },
            {
              userId: mate.userId,
              type: "SESSION_SCHEDULED",
              title: "Session time updated",
              body:
                `Your session for ${courseName} has been rescheduled. ` +
                "Open TXMate to view the updated time.",
              data: {
                sessionId,
                rescheduleRequestId,
                scheduledStart:
                  current.proposedStart.toISOString(),
                scheduledEnd:
                  current.proposedEnd.toISOString(),
              },
            },
          ],
        });

        return {
          kind: "accepted" as const,
          scheduledStart: current.proposedStart,
          scheduledEnd: current.proposedEnd,
        };
      },
      {
        maxWait: 10_000,
        timeout: 15_000,
      },
    );

    switch (result.kind) {
      case "proposal-changed":
        return NextResponse.json(
          {
            error:
              "This proposal has changed or already received a response.",
          },
          { status: 409 },
        );

      case "original-deadline-passed":
        return NextResponse.json(
          {
            error:
              "The original session's scheduled start time has passed. This proposal has expired, and the session was not moved.",
          },
          { status: 409 },
        );

      case "session-unavailable":
        return NextResponse.json(
          {
            error:
              "This arrangement or session is no longer eligible for rescheduling. The session was not moved.",
          },
          { status: 409 },
        );

      case "time-expired":
        return NextResponse.json(
          {
            error:
              "The proposed replacement time has passed. This proposal has expired, and the session was not moved.",
          },
          { status: 409 },
        );

      case "slot-held":
        return NextResponse.json(
          { error: "Another occurrence in this tutoring arrangement already uses that exact start time. The proposal remains pending." },
          { status: 409 },
        );

      case "arrangement-exists":
        return NextResponse.json(
          { error: "You already have another pending or accepted request for this Academic Mate offering. Resolve that arrangement before restoring this cancelled one-time arrangement." },
          { status: 409 },
        );

      case "conflict":
        return NextResponse.json(
          {
            error:
              "A participant now has another session at that time. The proposal remains pending.",
          },
          { status: 409 },
        );

      case "session-changed":
        return NextResponse.json(
          {
            error:
              "The session changed before the proposal could be applied.",
          },
          { status: 409 },
        );

      case "declined":
        return NextResponse.json({
          message:
            "The proposal was declined. The original session time remains unchanged.",
          status: "DECLINED",
        });

      case "accepted":
        return NextResponse.json({
          message: "The session has been rescheduled.",
          session: {
            id: sessionId,
            status: "SCHEDULED",
            scheduledStart: result.scheduledStart.toISOString(),
            scheduledEnd: result.scheduledEnd.toISOString(),
          },
        });
    }
  } catch (error) {
    console.error(
      "PATCH session reschedule response failed:",
      error,
    );

    return NextResponse.json(
      { error: "Unable to process the rescheduling response." },
      { status: 500 },
    );
  }
}
