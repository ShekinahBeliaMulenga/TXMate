
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    sessionId: string;
    rescheduleRequestId: string;
  }>;
};

const ACTIVE_SESSION_STATUSES = [
  "SCHEDULED",
  "IN_PROGRESS",
  "DISPUTED",
] as const;

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
              status: true,
              scheduledStart: true,
              request: {
                select: {
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
                      title: true,
                      course: {
                        select: { name: true },
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
                  status: true,
                  scheduledStart: true,
                },
              },
            },
          });

        if (
          !current ||
          current.status !== "PENDING" ||
          current.respondingUserId !== userId
        ) {
          return { kind: "proposal-changed" as const };
        }

        const now = new Date();

        if (
          current.session.status !== "SCHEDULED" ||
          current.session.scheduledStart <= now
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

        const conflict =
          await tx.tutoringSession.findFirst({
            where: {
              id: { not: sessionId },
              status: { in: [...ACTIVE_SESSION_STATUSES] },
              scheduledStart: {
                lt: current.proposedEnd,
              },
              scheduledEnd: {
                gt: current.proposedStart,
              },
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

        const updatedSession =
          await tx.tutoringSession.updateMany({
            where: {
              id: sessionId,
              status: "SCHEDULED",
              scheduledStart: { gt: now },
            },
            data: {
              scheduledStart: current.proposedStart,
              scheduledEnd: current.proposedEnd,
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

        const courseName =
          proposal.session.request.offering.title ||
          proposal.session.request.offering.course.name;

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

      case "session-unavailable":
        return NextResponse.json(
          {
            error:
              "The session is no longer scheduled. The proposal has expired.",
          },
          { status: 409 },
        );

      case "time-expired":
        return NextResponse.json(
          {
            error:
              "The proposed time has passed. Submit a new proposal.",
          },
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
