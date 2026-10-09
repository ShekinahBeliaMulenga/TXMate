import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type VerificationQueueStatus =
    | "PENDING"
    | "VERIFIED"
    | "REJECTED"
    | "UNVERIFIED";

async function getAuthenticatedAdmin() {
    const session = await auth.api.getSession({
        headers: await import("next/headers").then(
            ({ headers }) => headers(),
        ),
    });

    if (!session?.user) {
        return null;
    }

    return prisma.adminProfile.findUnique({
        where: {
            userId: session.user.id,
        },
        select: {
            id: true,
            role: true,
            universityAccess: {
                select: {
                    universityId: true,
                },
            },
        },
    });
}

function canReviewVerification(
    role: string,
) {
    return (
        role === "PLATFORM_ADMIN" ||
        role === "UNIVERSITY_ADMIN" ||
        role === "MODERATOR"
    );
}

/**
 * GET /api/admin/academic-mates/verification
 *
 * Returns Academic Mate profiles available for administrative
 * verification review.
 */
export async function GET(request: Request) {
    try {
        const admin = await getAuthenticatedAdmin();

        if (!admin) {
            return NextResponse.json(
                {
                    error: "Admin access required.",
                },
                { status: 403 },
            );
        }

        if (!canReviewVerification(admin.role)) {
            return NextResponse.json(
                {
                    error:
                        "You do not have permission to review Academic Mate verification.",
                },
                { status: 403 },
            );
        }

        const url = new URL(request.url);

        const requestedStatus =
            url.searchParams.get("status") ??
            "PENDING";

        const allowedStatuses =
            new Set<VerificationQueueStatus>([
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
                {
                    error: "Invalid verification status.",
                },
                { status: 400 },
            );
        }

        const universityIds =
            admin.universityAccess.map(
                (access) => access.universityId,
            );

        const universityFilter =
            admin.role === "PLATFORM_ADMIN"
                ? {}
                : {
                    universityId: {
                        in: universityIds,
                    },
                };

        const profiles =
            await prisma.academicMateProfile.findMany({
                where: {
                    verificationStatus:
                        requestedStatus as VerificationQueueStatus,
                    ...universityFilter,
                },
                orderBy: {
                    updatedAt: "asc",
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
                        where: {
                            status: "ACTIVE",
                        },
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
                        orderBy: {
                            startYear: "desc",
                        },
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
                        orderBy: {
                            year: "desc",
                        },
                        select: {
                            id: true,
                            name: true,
                            issuer: true,
                            year: true,
                            credentialUrl: true,
                        },
                    },

                    availabilities: {
                        where: {
                            isActive: true,
                        },
                        orderBy: [
                            {
                                day: "asc",
                            },
                            {
                                startMinute: "asc",
                            },
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
            {
                error: "An unexpected error occurred.",
            },
            { status: 500 },
        );
    }
}