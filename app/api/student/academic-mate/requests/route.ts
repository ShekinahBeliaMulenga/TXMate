import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { MateRequestStatus, Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ADMIN_SESSION_STATE_LABEL, adminSessionStateKey } from "@/lib/admin/session-state";

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

/** Fields needed to work out a session's real state, the same way the other screens do. */
const SESSION_FIELDS = {
  id: true,
  status: true,
  scheduledStart: true,
  scheduledEnd: true,
  meetingLocation: true,
  completedAt: true,
  studentCompletionConfirmedAt: true,
  mateCompletionConfirmedAt: true,
  completionDisputedAt: true,
  completionReviewRequiredAt: true,
  attendance: { select: { status: true, studentAttended: true, mateConfirmedStudentAttended: true } },
} as const;

type SessionFields = {
  id: string;
  status: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  meetingLocation: string;
  completedAt: Date | null;
  studentCompletionConfirmedAt: Date | null;
  mateCompletionConfirmedAt: Date | null;
  completionDisputedAt: Date | null;
  completionReviewRequiredAt: Date | null;
  attendance: { status: string; studentAttended: boolean | null; mateConfirmedStudentAttended: boolean | null } | null;
};

/** The stored status can still say "In progress" days after a session ended, so also send the real state (same rules as the Tutoring page for admins). */
function serializeSession(item: SessionFields, request: { status: string; arrangementStatus: string }) {
  const state = adminSessionStateKey({ ...item, requestStatus: request.status, arrangementStatus: request.arrangementStatus }, Date.now());
  return {
    id: item.id,
    status: item.status,
    state,
    stateLabel: ADMIN_SESSION_STATE_LABEL[state],
    scheduledStart: item.scheduledStart.toISOString(),
    scheduledEnd: item.scheduledEnd.toISOString(),
    meetingLocation: item.meetingLocation,
  };
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
            arrangementType: true,
            arrangementStatus: true,
            recurrenceEveryWeeks: true,
            recurrenceWeekday: true,
            recurrenceLocalStartMinute: true,
            recurrenceTimezone: true,
            recurrenceEndsAt: true,
            respondedAt: true,
            createdAt: true,

            studentProfile: {
              select: {
                id: true,
                profileVisibility: true,
                user: {
                  select: { name: true, image: true },
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
              select: SESSION_FIELDS,
            },
            sessions: {
              orderBy: { scheduledStart: "asc" },
              select: SESSION_FIELDS,
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
      arrangementType: record.arrangementType,
      arrangementStatus: record.arrangementStatus,
      recurrenceEveryWeeks: record.recurrenceEveryWeeks,
      recurrenceWeekday: record.recurrenceWeekday,
      recurrenceLocalStartMinute: record.recurrenceLocalStartMinute,
      recurrenceTimezone: record.recurrenceTimezone,
      recurrenceEndsAt: record.recurrenceEndsAt?.toISOString() ?? null,
      respondedAt: record.respondedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),

      student: {
        id: record.studentProfile.id,
        profileVisibility: record.studentProfile.profileVisibility,
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

      tutoringSession: record.tutoringSession ? serializeSession(record.tutoringSession, record) : null,
      sessions: record.sessions.map((item) => serializeSession(item, record)),
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