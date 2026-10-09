import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getAuthenticatedUser() {
    const session = await auth.api.getSession({
        headers: await import("next/headers").then(
            ({ headers }) => headers(),
        ),
    });

    return session?.user ?? null;
}

/**
 * GET /api/student/academic-mate/verification
 *
 * Returns the authenticated user's Academic Mate verification
 * status, readiness information, and verification history.
 */
export async function GET() {
    try {
        const user = await getAuthenticatedUser();

        if (!user) {
            return NextResponse.json(
                {
                    error: "Unauthorized.",
                },
                { status: 401 },
            );
        }

        const academicMate =
            await prisma.academicMateProfile.findUnique({
                where: {
                    userId: user.id,
                },
                select: {
                    id: true,
                    status: true,
                    verificationStatus: true,
                    headline: true,
                    bio: true,
                    teachingExperience: true,
                    yearsExperience: true,
                    verifiedAt: true,
                    createdAt: true,

                    studentProfile: {
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
                        select: {
                            id: true,
                        },
                    },

                    qualifications: {
                        select: {
                            id: true,
                        },
                    },

                    verificationHistory: {
                        orderBy: {
                            createdAt: "desc",
                        },
                        select: {
                            id: true,
                            status: true,
                            notes: true,
                            reviewedAt: true,
                            createdAt: true,
                            reviewedByAdmin: {
                                select: {
                                    user: {
                                        select: {
                                            name: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });

        if (!academicMate) {
            return NextResponse.json(
                {
                    error: "Academic Mate profile not found.",
                },
                { status: 404 },
            );
        }

        const readiness = {
            profile: Boolean(
                academicMate.headline?.trim() &&
                academicMate.bio?.trim(),
            ),

            studentProfile: Boolean(
                academicMate.studentProfile &&
                academicMate.studentProfile.status === "ACTIVE",
            ),

            academicBackground: Boolean(
                academicMate.studentProfile?.university &&
                academicMate.studentProfile?.programme &&
                academicMate.studentProfile?.programmeYear,
            ),

            offerings: academicMate.offerings.length > 0,
        };

        const readyForVerification =
            readiness.profile &&
            readiness.studentProfile &&
            readiness.academicBackground &&
            readiness.offerings;

        return NextResponse.json({
            profile: {
                id: academicMate.id,
                status: academicMate.status,
                verificationStatus:
                    academicMate.verificationStatus,
                headline: academicMate.headline,
                bio: academicMate.bio,
                teachingExperience:
                    academicMate.teachingExperience,
                yearsExperience: academicMate.yearsExperience,
                verifiedAt: academicMate.verifiedAt,
                createdAt: academicMate.createdAt,
            },

            student: academicMate.studentProfile,

            counts: {
                activeOfferings: academicMate.offerings.length,
                experiences: academicMate.experiences.length,
                qualifications: academicMate.qualifications.length,
            },

            readiness: {
                ...readiness,
                readyForVerification,
            },

            history: academicMate.verificationHistory.map(
                (entry) => ({
                    id: entry.id,
                    status: entry.status,
                    notes: entry.notes,
                    reviewedAt: entry.reviewedAt,
                    createdAt: entry.createdAt,
                    reviewedBy:
                        entry.reviewedByAdmin?.user.name ?? null,
                }),
            ),
        });
    } catch (error) {
        console.error(
            "GET /api/student/academic-mate/verification failed:",
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

/**
 * POST /api/student/academic-mate/verification
 *
 * Requests verification for the authenticated Academic Mate.
 *
 * Allowed transitions:
 *
 * UNVERIFIED -> PENDING
 * REJECTED   -> PENDING
 *
 * A user cannot verify their own profile.
 *
 * The Academic Mate profile update and verification-history
 * record are created atomically in a transaction.
 */
export async function POST() {
    try {
        const user = await getAuthenticatedUser();

        if (!user) {
            return NextResponse.json(
                {
                    error: "Unauthorized.",
                },
                { status: 401 },
            );
        }

        const academicMate =
            await prisma.academicMateProfile.findUnique({
                where: {
                    userId: user.id,
                },
                select: {
                    id: true,
                    status: true,
                    verificationStatus: true,
                    headline: true,
                    bio: true,

                    studentProfile: {
                        select: {
                            id: true,
                            status: true,
                        },
                    },

                    offerings: {
                        where: {
                            status: "ACTIVE",
                        },
                        select: {
                            id: true,
                        },
                    },
                },
            });

        if (!academicMate) {
            return NextResponse.json(
                {
                    error: "Academic Mate profile not found.",
                },
                { status: 404 },
            );
        }

        if (academicMate.status !== "ACTIVE") {
            return NextResponse.json(
                {
                    error:
                        "Only an active Academic Mate profile can request verification.",
                },
                { status: 400 },
            );
        }

        if (!academicMate.studentProfile) {
            return NextResponse.json(
                {
                    error:
                        "A linked student profile is required before requesting verification.",
                },
                { status: 400 },
            );
        }

        if (
            academicMate.studentProfile.status !==
            "ACTIVE"
        ) {
            return NextResponse.json(
                {
                    error:
                        "The linked student profile must be active before requesting verification.",
                },
                { status: 400 },
            );
        }

        if (
            academicMate.verificationStatus ===
            "PENDING"
        ) {
            return NextResponse.json(
                {
                    error:
                        "Your Academic Mate profile is already awaiting verification.",
                },
                { status: 409 },
            );
        }

        if (
            academicMate.verificationStatus ===
            "VERIFIED"
        ) {
            return NextResponse.json(
                {
                    error:
                        "Your Academic Mate profile is already verified.",
                },
                { status: 409 },
            );
        }

        /*
         * This explicitly checks both null and empty values.
         */
        if (!academicMate.headline?.trim()) {
            return NextResponse.json(
                {
                    error:
                        "Add an Academic Mate headline before requesting verification.",
                },
                { status: 400 },
            );
        }

        if (!academicMate.bio?.trim()) {
            return NextResponse.json(
                {
                    error:
                        "Add an Academic Mate bio before requesting verification.",
                },
                { status: 400 },
            );
        }

        if (academicMate.offerings.length === 0) {
            return NextResponse.json(
                {
                    error:
                        "Add at least one active course offering before requesting verification.",
                },
                { status: 400 },
            );
        }

        /*
         * Update the Academic Mate profile and create the
         * verification-history record atomically.
         */
        const result = await prisma.$transaction(
            async (tx) => {
                /*
                 * Re-check the verification state inside the
                 * transaction to reduce the possibility of two
                 * simultaneous requests both being accepted.
                 */
                const current =
                    await tx.academicMateProfile.findUnique({
                        where: {
                            id: academicMate.id,
                        },
                        select: {
                            id: true,
                            verificationStatus: true,
                        },
                    });

                if (!current) {
                    throw new Error(
                        "Academic Mate profile not found.",
                    );
                }

                if (
                    current.verificationStatus ===
                    "PENDING"
                ) {
                    throw new Error(
                        "Your Academic Mate profile is already awaiting verification.",
                    );
                }

                if (
                    current.verificationStatus ===
                    "VERIFIED"
                ) {
                    throw new Error(
                        "Your Academic Mate profile is already verified.",
                    );
                }

                const updated =
                    await tx.academicMateProfile.update({
                        where: {
                            id: academicMate.id,
                        },
                        data: {
                            verificationStatus: "PENDING",
                            verifiedAt: null,
                            verifiedByAdminId: null,
                        },
                        select: {
                            id: true,
                            verificationStatus: true,
                            updatedAt: true,
                        },
                    });

                const history =
                    await tx.academicMateVerification.create(
                        {
                            data: {
                                academicMateProfileId:
                                    academicMate.id,
                                status: "PENDING",
                                notes: null,
                                reviewedByAdminId: null,
                                reviewedAt: null,
                            },
                            select: {
                                id: true,
                                status: true,
                                createdAt: true,
                            },
                        },
                    );

                return {
                    profile: updated,
                    history,
                };
            },
        );

        return NextResponse.json({
            message:
                "Academic Mate verification request submitted successfully.",

            profile: result.profile,

            verification: result.history,
        });
    } catch (error) {
        if (
            error instanceof Error &&
            (
                error.message ===
                "Your Academic Mate profile is already awaiting verification." ||
                error.message ===
                "Your Academic Mate profile is already verified."
            )
        ) {
            return NextResponse.json(
                {
                    error: error.message,
                },
                { status: 409 },
            );
        }

        console.error(
            "POST /api/student/academic-mate/verification failed:",
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