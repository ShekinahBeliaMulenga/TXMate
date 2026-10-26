
import { NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/admin/guard";
import { universityScopeFilter } from "@/lib/admin/permissions";
import { prisma } from "@/lib/prisma";

type VerificationQueueStatus =
  | "PENDING"
  | "VERIFIED"
  | "REJECTED"
  | "UNVERIFIED";

/** GET /api/admin/academic-mates/verification */
export async function GET(request: Request) {
  try {
    const authResult = await authorizeAdmin("verification:review");
    if (!authResult.ok) return authResult.response;
    const admin = authResult.admin;

    const url = new URL(request.url);
    const requestedStatus = url.searchParams.get("status") ?? "PENDING";

    const allowedStatuses = new Set<VerificationQueueStatus>([
      "PENDING",
      "VERIFIED",
      "REJECTED",
      "UNVERIFIED",
    ]);

    if (
      !allowedStatuses.has(
        requestedStatus as VerificationQueueStatus,
      )
    ) {
      return NextResponse.json(
        { error: "Invalid verification status." },
        { status: 400 },
      );
    }

    const status = requestedStatus as VerificationQueueStatus;

    const universityFilter = universityScopeFilter(admin.scope);

    const records = await prisma.academicMateProfile.findMany({
      where: {
        verificationStatus: status,
        ...universityFilter,
      },
      select: {
        id: true,
        status: true,
        verificationStatus: true,
        headline: true,
        bio: true,
        teachingExperience: true,
        yearsExperience: true,
        createdAt: true,
        updatedAt: true,

        verificationHistory: {
          where: { status },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            createdAt: true,
          },
        },

        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },

        university: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },

        studentProfile: {
          select: {
            id: true,
            studentId: true,
            status: true,
            programme: {
              select: {
                id: true,
                code: true,
                name: true,
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
          },
        },

        offerings: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            courseId: true,
            title: true,
            description: true,
            rate: true,
            currency: true,
            sessionDurationMinutes: true,
            status: true,
            verificationStatus: true,
            course: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },

        experiences: {
          orderBy: { startYear: "desc" },
          select: {
            id: true,
            title: true,
            organisation: true,
            description: true,
            startYear: true,
            endYear: true,
          },
        },

        qualifications: {
          orderBy: { year: "desc" },
          select: {
            id: true,
            name: true,
            issuer: true,
            year: true,
            credentialUrl: true,
          },
        },

        availabilities: {
          where: { isActive: true },
          orderBy: [
            { day: "asc" },
            { startMinute: "asc" },
          ],
          select: {
            id: true,
            day: true,
            startMinute: true,
            endMinute: true,
            timezone: true,
          },
        },
      },
    });

    const profiles = records
      .map(({ verificationHistory, ...profile }) => ({
        ...profile,
        verificationSubmittedAt: (
          verificationHistory[0]?.createdAt ?? profile.createdAt
        ).toISOString(),
      }))
      .sort(
        (a, b) =>
          new Date(a.verificationSubmittedAt).getTime() -
          new Date(b.verificationSubmittedAt).getTime(),
      );

    return NextResponse.json({
      profiles,
      total: profiles.length,
    });
  } catch (error) {
    console.error(
      "GET /api/admin/academic-mates/verification failed:",
      error,
    );

    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}
