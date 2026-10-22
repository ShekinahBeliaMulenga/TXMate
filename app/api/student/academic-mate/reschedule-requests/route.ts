import { headers } from "next/headers";
import { NextResponse } from "next/server";

import type { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lists pending rescheduling proposals that this Academic Mate must respond to.
 * The query is based on the proposal recipient, not on the arrangement's next
 * active session, so a cancelled recurring occurrence remains discoverable.
 */
export async function GET(request: Request) {
  try {
    const authSession = await auth.api.getSession({ headers: await headers() });
    if (!authSession?.user) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const academicMate = await prisma.academicMateProfile.findUnique({
      where: { userId: authSession.user.id },
      select: { id: true },
    });

    if (!academicMate) {
      return NextResponse.json({ error: "Academic Mate profile not found." }, { status: 404 });
    }

    const url = new URL(request.url);
    const requestedPage = Number(url.searchParams.get("page") ?? "1");
    const page = Number.isInteger(requestedPage) && requestedPage > 0 && requestedPage <= 10_000 ? requestedPage : 1;
    const pageSize = 25;
    const now = new Date();
    const where: Prisma.SessionRescheduleRequestWhereInput = {
      respondingUserId: authSession.user.id,
      status: "PENDING" as const,
      proposedStart: { gt: now },
      session: {
        is: {
          // The original occurrence date controls proposal eligibility.
          scheduledStart: { gt: now },
          status: { in: ["SCHEDULED", "CANCELLED"] },
          request: {
            is: {
              AND: [
                {
                  offering: {
                    is: { academicMateProfileId: academicMate.id },
                  },
                },
                {
                  OR: [
                    { arrangementStatus: "ACTIVE" },
                    {
                      arrangementType: "ONE_TIME",
                      arrangementStatus: "CANCELLED",
                      status: "CANCELLED",
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    };

    const [total, proposals] = await Promise.all([
      prisma.sessionRescheduleRequest.count({ where }),
      prisma.sessionRescheduleRequest.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          sessionId: true,
          proposedStart: true,
          proposedEnd: true,
          reason: true,
          status: true,
          createdAt: true,
          proposedBy: { select: { name: true } },
          session: {
            select: {
              id: true,
              status: true,
              scheduledStart: true,
              scheduledEnd: true,
              meetingLocation: true,
              request: {
                select: {
                  arrangementType: true,
                  arrangementStatus: true,
                  studentProfile: {
                    select: {
                      user: { select: { name: true, image: true } },
                    },
                  },
                  offering: {
                    select: {
                      title: true,
                      course: { select: { code: true, name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      count: total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
      proposals: proposals.map((proposal) => ({
        id: proposal.id,
        sessionId: proposal.sessionId,
        proposedStart: proposal.proposedStart.toISOString(),
        proposedEnd: proposal.proposedEnd.toISOString(),
        reason: proposal.reason,
        status: proposal.status,
        createdAt: proposal.createdAt.toISOString(),
        proposedByName: proposal.proposedBy.name,
        session: {
          id: proposal.session.id,
          status: proposal.session.status,
          scheduledStart: proposal.session.scheduledStart.toISOString(),
          scheduledEnd: proposal.session.scheduledEnd.toISOString(),
          meetingLocation: proposal.session.meetingLocation,
          arrangementType: proposal.session.request.arrangementType,
          arrangementStatus: proposal.session.request.arrangementStatus,
          studentName: proposal.session.request.studentProfile.user.name,
          studentImage: proposal.session.request.studentProfile.user.image,
          courseCode: proposal.session.request.offering.course.code,
          courseName: proposal.session.request.offering.course.name,
          offeringTitle: proposal.session.request.offering.title,
        },
      })),
    });
  } catch (error) {
    console.error("GET /api/student/academic-mate/reschedule-requests failed:", error);
    return NextResponse.json(
      { error: "Unable to load pending rescheduling proposals." },
      { status: 500 },
    );
  }
}
