import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "You must be signed in to view your dashboard." },
        { status: 401 },
      );
    }

    const student = await prisma.studentProfile.findUnique({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
        status: true,
        university: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        programme: {
          select: {
            id: true,
            name: true,
            code: true,
            department: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
        programmeYear: {
          select: {
            id: true,
            yearNumber: true,
          },
        },
        courses: {
          where: {
            status: {
              in: ["ENROLLED", "REPEATING"],
            },
          },
          orderBy: {
            course: {
              code: "asc",
            },
          },
          select: {
            id: true,
            status: true,
            course: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json(
        {
          error: "Student profile not found. Complete onboarding first.",
        },
        { status: 404 },
      );
    }

    const now = new Date();

    const [
      totalRequests,
      pendingRequests,
      completedSessionsCount,
      upcomingSessionsCount,
      recentRequests,
      upcomingSessions,
    ] = await Promise.all([
      prisma.mateRequest.count({
        where: {
          studentProfileId: student.id,
        },
      }),

      prisma.mateRequest.count({
        where: {
          studentProfileId: student.id,
          status: "REQUESTED",
        },
      }),

      prisma.tutoringSession.count({
        where: {
          status: "COMPLETED",
          request: {
            studentProfileId: student.id,
          },
        },
      }),

      prisma.tutoringSession.count({
        where: {
          status: "SCHEDULED",
          scheduledStart: {
            gte: now,
          },
          request: {
            studentProfileId: student.id,
          },
        },
      }),

      prisma.mateRequest.findMany({
        where: {
          studentProfileId: student.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
        select: {
          id: true,
          status: true,
          message: true,
          requestedStart: true,
          requestedEnd: true,
          createdAt: true,
          offering: {
            select: {
              title: true,
              rate: true,
              currency: true,
              rateType: true,
              course: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
              academicMateProfile: {
                select: {
                  user: {
                    select: {
                      name: true,
                      image: true,
                    },
                  },
                },
              },
            },
          },
          tutoringSession: {
            select: {
              id: true,
              status: true,
              scheduledStart: true,
              scheduledEnd: true,
            },
          },
        },
      }),

      prisma.tutoringSession.findMany({
        where: {
          status: "SCHEDULED",
          scheduledStart: {
            gte: now,
          },
          request: {
            studentProfileId: student.id,
          },
        },
        orderBy: {
          scheduledStart: "asc",
        },
        take: 5,
        select: {
          id: true,
          scheduledStart: true,
          scheduledEnd: true,
          meetingLocation: true,
          status: true,
          request: {
            select: {
              id: true,
              offering: {
                select: {
                  title: true,
                  course: {
                    select: {
                      code: true,
                      name: true,
                    },
                  },
                  academicMateProfile: {
                    select: {
                      user: {
                        select: {
                          name: true,
                          image: true,
                        },
                      },
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
      student: {
        name: session.user.name,
        status: student.status,
        university: student.university,
        programme: student.programme,
        programmeYear: student.programmeYear,
      },

      summary: {
        enrolledCourses: student.courses.length,
        totalRequests,
        pendingRequests,
        completedSessions: completedSessionsCount,
        upcomingSessions: upcomingSessionsCount,
      },

      courses: student.courses.map((studentCourse) => ({
        id: studentCourse.id,
        status: studentCourse.status,
        course: studentCourse.course,
      })),

      recentRequests: recentRequests.map((request) => ({
        id: request.id,
        status: request.status,
        message: request.message,
        requestedStart: request.requestedStart,
        requestedEnd: request.requestedEnd,
        createdAt: request.createdAt,
        offering: {
          title: request.offering.title,
          rate: request.offering.rate.toString(),
          currency: request.offering.currency,
          rateType: request.offering.rateType,
          course: request.offering.course,
          academicMate: request.offering.academicMateProfile.user,
        },
        tutoringSession: request.tutoringSession,
      })),

      upcomingSessions,
    });
  } catch (error) {
    console.error("Student dashboard GET failed:", error);

    return NextResponse.json(
      { error: "Unable to load your dashboard." },
      { status: 500 },
    );
  }
}
