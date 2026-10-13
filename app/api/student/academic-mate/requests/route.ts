import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { MateRequestStatus, Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = [
  "REQUESTED",
  "ACCEPTED",
  "DECLINED",
  "CANCELLED",
  "EXPIRED",
] as const;

type FilterStatus = (typeof VALID_STATUSES)[number];

function isFilterStatus(value: string): value is FilterStatus {
  return VALID_STATUSES.includes(value as FilterStatus);
}

function getPositiveInteger(value: string | null, fallback: number) {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be signed in to view requests." },
        { status: 401 }
      );
    }

    const academicMate = await prisma.academicMateProfile.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        status: true,
        verificationStatus: true,
      },
    });

    if (!academicMate) {
      return NextResponse.json(
        { error: "Academic Mate profile not found." },
        { status: 404 }
      );
    }

    const url = new URL(request.url);

    const query = (url.searchParams.get("q") ?? "")
      .trim()
      .slice(0, 100);

    const courseId = (url.searchParams.get("courseId") ?? "").trim();
    const requestedStatus = (url.searchParams.get("status") ?? "REQUESTED")
      .trim()
      .toUpperCase();

    const selectedStatus =
      requestedStatus !== "ALL" && isFilterStatus(requestedStatus)
        ? (requestedStatus as MateRequestStatus)
        : null;

    const requestedPage = getPositiveInteger(
      url.searchParams.get("page"),
      1
    );

    const requestedPageSize = getPositiveInteger(
      url.searchParams.get("pageSize"),
      25
    );

    const pageSize = [25, 50, 100].includes(requestedPageSize)
      ? requestedPageSize
      : 25;

    // Every query is scoped to offerings belonging to this Academic Mate.
    const filters: Prisma.MateRequestWhereInput[] = [
      {
        offering: {
          is: {
            academicMateProfileId: academicMate.id,
          },
        },
      },
    ];

    if (selectedStatus) {
      filters.push({ status: selectedStatus });
    }

    if (courseId) {
      filters.push({
        offering: {
          is: { courseId },
        },
      });
    }

    if (query) {
      filters.push({
        OR: [
          {
            studentProfile: {
              is: {
                user: {
                  is: {
                    name: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                },
              },
            },
          },
          {
            studentProfile: {
              is: {
                programme: {
                  is: {
                    name: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                },
              },
            },
          },
          {
            studentProfile: {
              is: {
                programme: {
                  is: {
                    code: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                },
              },
            },
          },
          {
            studentProfile: {
              is: {
                university: {
                  is: {
                    name: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                },
              },
            },
          },
          {
            message: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            offering: {
              is: {
                title: {
                  contains: query,
                  mode: "insensitive",
                },
              },
            },
          },
          {
            offering: {
              is: {
                course: {
                  is: {
                    code: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                },
              },
            },
          },
          {
            offering: {
              is: {
                course: {
                  is: {
                    name: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                },
              },
            },
          },
        ],
      });
    }

    const where: Prisma.MateRequestWhereInput = {
      AND: filters,
    };

    const total = await prisma.mateRequest.count({ where });

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const skip = (page - 1) * pageSize;

    const [records, pendingRequests, totalRequests, acceptedRequests, declinedRequests, offerings] =
      await Promise.all([
        prisma.mateRequest.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip,
          take: pageSize,
          select: {
            id: true,
            status: true,
            message: true,
            requestedStart: true,
            requestedEnd: true,
            respondedAt: true,
            createdAt: true,

            studentProfile: {
              select: {
                user: {
                  select: { name: true, image: true,},
                },
                university: {
                  select: {
                    name: true,
                    code: true,
                  },
                },
                programme: {
                  select: {
                    name: true,
                    code: true,
                  },
                },
                programmeYear: {
                  select: {
                    yearNumber: true,
                  },
                },
              },
            },

            offering: {
              select: {
                id: true,
                title: true,
                description: true,
                rate: true,
                currency: true,
                rateType: true,
                sessionDurationMinutes: true,
                course: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
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
                meetingLocation: true,
              },
            },
          },
        }),

        prisma.mateRequest.count({
          where: {
            offering: {
              is: { academicMateProfileId: academicMate.id },
            },
            status: "REQUESTED",
          },
        }),

        prisma.mateRequest.count({
          where: {
            offering: {
              is: { academicMateProfileId: academicMate.id },
            },
          },
        }),

        prisma.mateRequest.count({
          where: {
            offering: {
              is: { academicMateProfileId: academicMate.id },
            },
            status: "ACCEPTED",
          },
        }),

        prisma.mateRequest.count({
          where: {
            offering: {
              is: { academicMateProfileId: academicMate.id },
            },
            status: "DECLINED",
          },
        }),

        prisma.mateOffering.findMany({
          where: {
            academicMateProfileId: academicMate.id,
          },
          orderBy: {
            course: { code: "asc" },
          },
          select: {
            course: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        }),
      ]);

    const courses = offerings.map((offering) => offering.course);

    const uniqueCourses = Array.from(
      new Map(courses.map((course) => [course.id, course])).values()
    );

    const requests = records.map((record) => ({
      id: record.id,
      status: record.status,
      message: record.message,
      requestedStart: record.requestedStart?.toISOString() ?? null,
      requestedEnd: record.requestedEnd?.toISOString() ?? null,
      respondedAt: record.respondedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),

      student: {
        name: record.studentProfile.user.name,
        image: record.studentProfile.user.image,
        university: record.studentProfile.university,
        programme: record.studentProfile.programme,
        yearNumber: record.studentProfile.programmeYear.yearNumber,
      },

      offering: {
        id: record.offering.id,
        title: record.offering.title,
        description: record.offering.description,
        rate: record.offering.rate.toString(),
        currency: "ZMW" === record.offering.currency
          ? record.offering.currency
          : record.offering.currency,
        rateType: record.offering.rateType,
        sessionDurationMinutes: record.offering.sessionDurationMinutes,
        course: record.offering.course,
      },

      tutoringSession: record.tutoringSession
        ? {
            id: record.tutoringSession.id,
            status: record.tutoringSession.status,
            scheduledStart:
              record.tutoringSession.scheduledStart.toISOString(),
            scheduledEnd:
              record.tutoringSession.scheduledEnd.toISOString(),
            meetingLocation: record.tutoringSession.meetingLocation,
          }
        : null,
    }));

    return NextResponse.json({
      academicMate: {
        status: academicMate.status,
        verificationStatus: academicMate.verificationStatus,
      },

      summary: {
        pendingRequests,
        totalRequests,
        acceptedRequests,
        declinedRequests,
      },

      requests,

      courses: uniqueCourses,

      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Failed to load Academic Mate requests:", error);

    return NextResponse.json(
      { error: "Unable to load incoming requests." },
      { status: 500 }
    );
  }
}