import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
type VerificationDecision = "VERIFIED" | "REJECTED";
const REVIEWER_ROLES = new Set([
    "PLATFORM_ADMIN",
    "UNIVERSITY_ADMIN",
    "MODERATOR",
]);
async function getAuthenticatedAdmin() {
    const session = await auth.api.getSession({
        headers: await import("next/headers").then(({ headers }) =>
            headers(),
        ),
    });
    if (!session?.user?.id) {
        return null;
    }
    const admin = await prisma.adminProfile.findUnique({
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
    if (!admin) {
        return null;
    }
    return admin;
}
function canReviewVerification(role: string) {
    return REVIEWER_ROLES.has(role);
}
function canAccessUniversity(
    admin: Awaited<ReturnType<typeof getAuthenticatedAdmin>>,
    universityId: string,
) {
    if (!admin) {
        return false;
    }
    if (admin.role === "PLATFORM_ADMIN") {
        return true;
    }
    return admin.universityAccess.some(
        (access) => access.universityId === universityId,
    );
}
function isValidAcademicMateId(value: string) {
    return value.trim().length > 0 && value.length <= 100;
}
function serializeDate(value: Date | null) {
    return value ? value.toISOString() : null;
}
/**
 * GET /api/admin/academic-mates/verification/[academicMateId]
 *
 * Returns the complete Academic Mate verification record
 * for the authenticated administrator.
 */
export async function GET(
    _request: Request,
    context: {
        params: Promise<{
            academicMateId: string;
        }>;
    },
) {
    try {
        const admin = await getAuthenticatedAdmin();
        if (!admin) {
            return NextResponse.json(
                {
                    error: "Unauthorized.",
                },
                { status: 401 },
            );
        }
        if (!canReviewVerification(admin.role)) {
            return NextResponse.json(
                {
                    error: "You do not have permission to review Academic Mate verification.",
                },
                { status: 403 },
            );
        }
        const { academicMateId } = await context.params;
        if (!isValidAcademicMateId(academicMateId)) {
            return NextResponse.json(
                {
                    error: "Invalid Academic Mate ID.",
                },
                { status: 400 },
            );
        }
        const academicMate =
            await prisma.academicMateProfile.findUnique({
                where: {
                    id: academicMateId,
                },
                select: {
                    id: true,
                    userId: true,
                    universityId: true,
                    studentProfileId: true,
                    status: true,
                    verificationStatus: true,
                    headline: true,
                    bio: true,
                    teachingExperience: true,
                    yearsExperience: true,
                    profileVisibility: true,
                    verifiedAt: true,
                    verifiedByAdminId: true,
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
                            gender: true,
                            status: true,
                            programme: {
                                select: {
                                    id: true,
                                    code: true,
                                    name: true,
                                    school: {
                                        select: {
                                            id: true,
                                            code: true,
                                            name: true,
                                        },
                                    },
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
                                orderBy: [
                                    {
                                        course: {
                                            code: "asc",
                                        },
                                    },
                                ],
                                select: {
                                    id: true,
                                    status: true,
                                    semester: true,
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
                    },
                    offerings: {
                        orderBy: {
                            createdAt: "desc",
                        },
                        select: {
                            id: true,
                            title: true,
                            description: true,
                            rate: true,
                            currency: true,
                            sessionDurationMinutes: true,
                            status: true,
                            verificationStatus: true,
                            rateType: true,
                            rateDetails: true,
                            createdAt: true,
                            updatedAt: true,
                            course: {
                                select: {
                                    id: true,
                                    code: true,
                                    name: true,
                                },
                            },
                            topics: {
                                select: {
                                    topic: {
                                        select: {
                                            id: true,
                                            name: true,
                                            description: true,
                                        },
                                    },
                                },
                            },
                            verifications: {
                                orderBy: {
                                    createdAt: "desc",
                                },
                                select: {
                                    id: true,
                                    status: true,
                                    notes: true,
                                    evidenceUrl: true,
                                    reviewedAt: true,
                                    createdAt: true,
                                    reviewedByAdmin: {
                                        select: {
                                            id: true,
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
                    },
                    availabilities: {
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
                            isActive: true,
                            mateOffering: {
                                select: {
                                    id: true,
                                    course: {
                                        select: {
                                            code: true,
                                            name: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    experiences: {
                        orderBy: [
                            {
                                startYear: "desc",
                            },
                            {
                                createdAt: "desc",
                            },
                        ],
                        select: {
                            id: true,
                            title: true,
                            organisation: true,
                            description: true,
                            startYear: true,
                            endYear: true,
                            createdAt: true,
                        },
                    },
                    qualifications: {
                        orderBy: [
                            {
                                year: "desc",
                            },
                            {
                                createdAt: "desc",
                            },
                        ],
                        select: {
                            id: true,
                            name: true,
                            issuer: true,
                            year: true,
                            credentialUrl: true,
                            createdAt: true,
                        },
                    },
                    reviews: {
                        orderBy: {
                            createdAt: "desc",
                        },
                        select: {
                            id: true,
                            rating: true,
                            comment: true,
                            createdAt: true,
                            reviewerUser: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    },
                    verifiedByAdmin: {
                        select: {
                            id: true,
                            user: {
                                select: {
                                    name: true,
                                },
                            },
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
                                    id: true,
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
        if (
            !canAccessUniversity(
                admin,
                academicMate.universityId,
            )
        ) {
            return NextResponse.json(
                {
                    error:
                        "You do not have access to this university's Academic Mate records.",
                },
                { status: 403 },
            );
        }
        return NextResponse.json({
            profile: {
                id: academicMate.id,
                userId: academicMate.userId,
                studentProfileId: academicMate.studentProfileId,
                status: academicMate.status,
                verificationStatus:
                    academicMate.verificationStatus,
                headline: academicMate.headline,
                bio: academicMate.bio,
                teachingExperience:
                    academicMate.teachingExperience,
                yearsExperience: academicMate.yearsExperience,
                profileVisibility:
                    academicMate.profileVisibility,
                verifiedAt: serializeDate(
                    academicMate.verifiedAt,
                ),
                verifiedByAdmin:
                    academicMate.verifiedByAdmin
                        ? {
                            id: academicMate.verifiedByAdmin.id,
                            name:
                                academicMate.verifiedByAdmin
                                    .user.name,
                        }
                        : null,
                createdAt:
                    academicMate.createdAt.toISOString(),
                updatedAt:
                    academicMate.updatedAt.toISOString(),
            },
            user: academicMate.user,
            university: academicMate.university,
            student: academicMate.studentProfile
                ? {
                    ...academicMate.studentProfile,
                }
                : null,
            offerings: academicMate.offerings.map(
                (offering) => ({
                    id: offering.id,
                    course: offering.course,
                    title: offering.title,
                    description: offering.description,
                    rate: offering.rate.toString(),
                    currency: offering.currency,
                    sessionDurationMinutes:
                        offering.sessionDurationMinutes,
                    status: offering.status,
                    verificationStatus:
                        offering.verificationStatus,
                    rateType: offering.rateType,
                    rateDetails: offering.rateDetails,
                    createdAt:
                        offering.createdAt.toISOString(),
                    updatedAt:
                        offering.updatedAt.toISOString(),
                    topics: offering.topics.map(
                        ({ topic }) => topic,
                    ),
                    verifications:
                        offering.verifications.map(
                            (verification) => ({
                                id: verification.id,
                                status:
                                    verification.status,
                                notes: verification.notes,
                                evidenceUrl:
                                    verification.evidenceUrl,
                                reviewedAt:
                                    serializeDate(
                                        verification.reviewedAt,
                                    ),
                                createdAt:
                                    verification.createdAt.toISOString(),
                                reviewedByAdmin:
                                    verification.reviewedByAdmin
                                        ? {
                                            id:
                                                verification
                                                    .reviewedByAdmin
                                                    .id,
                                            name:
                                                verification
                                                    .reviewedByAdmin
                                                    .user
                                                    .name,
                                        }
                                        : null,
                            }),
                        ),
                }),
            ),
            availability:
                academicMate.availabilities.map(
                    (item) => ({
                        id: item.id,
                        day: item.day,
                        startMinute: item.startMinute,
                        endMinute: item.endMinute,
                        timezone: item.timezone,
                        isActive: item.isActive,
                        offering: item.mateOffering,
                    }),
                ),
            experiences: academicMate.experiences,
            qualifications:
                academicMate.qualifications,
            reviews: academicMate.reviews.map(
                (review) => ({
                    id: review.id,
                    rating: review.rating,
                    comment: review.comment,
                    createdAt:
                        review.createdAt.toISOString(),
                    reviewerName:
                        review.reviewerUser.name,
                }),
            ),
            verificationHistory:
                academicMate.verificationHistory.map(
                    (entry) => ({
                        id: entry.id,
                        status: entry.status,
                        notes: entry.notes,
                        reviewedAt: serializeDate(
                            entry.reviewedAt,
                        ),
                        createdAt:
                            entry.createdAt.toISOString(),
                        reviewedByAdmin:
                            entry.reviewedByAdmin
                                ? {
                                    id:
                                        entry
                                            .reviewedByAdmin
                                            .id,
                                    name:
                                        entry
                                            .reviewedByAdmin
                                            .user
                                            .name,
                                }
                                : null,
                    }),
                ),
        });
    } catch (error) {
        console.error(
            "GET /api/admin/academic-mates/verification/[academicMateId] failed:",
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
 * PATCH /api/admin/academic-mates/verification/[academicMateId]
 *
 * Approves or rejects a pending Academic Mate profile.
 */
export async function PATCH(
    request: Request,
    context: {
        params: Promise<{
            academicMateId: string;
        }>;
    },
) {
    try {
        const admin = await getAuthenticatedAdmin();
        if (!admin) {
            return NextResponse.json(
                {
                    error: "Unauthorized.",
                },
                { status: 401 },
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
        const { academicMateId } = await context.params;
        if (!isValidAcademicMateId(academicMateId)) {
            return NextResponse.json(
                {
                    error: "Invalid Academic Mate ID.",
                },
                { status: 400 },
            );
        }
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                {
                    error:
                        "Request body must contain valid JSON.",
                },
                { status: 400 },
            );
        }
        if (
            typeof body !== "object" ||
            body === null ||
            Array.isArray(body)
        ) {
            return NextResponse.json(
                {
                    error:
                        "Request body must be a JSON object.",
                },
                { status: 400 },
            );
        }
        const payload = body as Record<
            string,
            unknown
        >;
        const decision = payload.decision;
        if (
            decision !== "VERIFIED" &&
            decision !== "REJECTED"
        ) {
            return NextResponse.json(
                {
                    error:
                        "Decision must be VERIFIED or REJECTED.",
                },
                { status: 400 },
            );
        }
        const rawNotes = payload.notes;
        if (
            rawNotes !== undefined &&
            rawNotes !== null &&
            typeof rawNotes !== "string"
        ) {
            return NextResponse.json(
                {
                    error: "notes must be a string or null.",
                },
                { status: 400 },
            );
        }
        const notes =
            typeof rawNotes === "string"
                ? rawNotes.trim()
                : null;
        if (notes && notes.length > 2000) {
            return NextResponse.json(
                {
                    error:
                        "Verification notes cannot exceed 2000 characters.",
                },
                { status: 400 },
            );
        }
        if (decision === "REJECTED" && !notes) {
            return NextResponse.json(
                {
                    error:
                        "A reason is required when rejecting an application.",
                },
                { status: 400 },
            );
        }
        const academicMate =
            await prisma.academicMateProfile.findUnique({
                where: {
                    id: academicMateId,
                },
                select: {
                    id: true,
                    universityId: true,
                    status: true,
                    verificationStatus: true,
                    studentProfileId: true,
                    studentProfile: {
                        select: {
                            status: true,
                        },
                    },
                },
            });
        if (!academicMate) {
            return NextResponse.json(
                {
                    error:
                        "Academic Mate profile not found.",
                },
                { status: 404 },
            );
        }
        if (
            !canAccessUniversity(
                admin,
                academicMate.universityId,
            )
        ) {
            return NextResponse.json(
                {
                    error:
                        "You do not have access to this university's Academic Mate records.",
                },
                { status: 403 },
            );
        }
        if (
            academicMate.verificationStatus !==
            "PENDING"
        ) {
            return NextResponse.json(
                {
                    error:
                        "This Academic Mate profile is not currently pending verification.",
                },
                { status: 409 },
            );
        }
        if (academicMate.status !== "ACTIVE") {
            return NextResponse.json(
                {
                    error:
                        "The Academic Mate profile is not active.",
                },
                { status: 409 },
            );
        }
        if (
            !academicMate.studentProfileId ||
            academicMate.studentProfile?.status !==
            "ACTIVE"
        ) {
            return NextResponse.json(
                {
                    error:
                        "The linked student profile is not active.",
                },
                { status: 409 },
            );
        }
        const reviewedAt = new Date();
        const result = await prisma.$transaction(
            async (tx) => {
                const current =
                    await tx.academicMateProfile.findUnique(
                        {
                            where: {
                                id: academicMate.id,
                            },
                            select: {
                                id: true,
                                verificationStatus: true,
                                status: true,
                            },
                        },
                    );
                if (!current) {
                    throw new Error(
                        "ACADEMIC_MATE_NOT_FOUND",
                    );
                }
                if (
                    current.verificationStatus !==
                    "PENDING"
                ) {
                    throw new Error(
                        "VERIFICATION_STATE_CHANGED",
                    );
                }
                if (current.status !== "ACTIVE") {
                    throw new Error(
                        "ACADEMIC_MATE_NOT_ACTIVE",
                    );
                }
                const updated =
                    await tx.academicMateProfile.update(
                        {
                            where: {
                                id: academicMate.id,
                            },
                            data: {
                                verificationStatus:
                                    decision as VerificationDecision,
                                verifiedAt:
                                    decision ===
                                        "VERIFIED"
                                        ? reviewedAt
                                        : null,
                                verifiedByAdminId:
                                    admin.id,
                            },
                            select: {
                                id: true,
                                verificationStatus:
                                    true,
                                verifiedAt: true,
                                verifiedByAdminId: true,
                            },
                        },
                    );
                const history =
                    await tx.academicMateVerification.create(
                        {
                            data: {
                                academicMateProfileId:
                                    academicMate.id,
                                status:
                                    decision as VerificationDecision,
                                notes,
                                reviewedByAdminId:
                                    admin.id,
                                reviewedAt,
                            },
                            select: {
                                id: true,
                                status: true,
                                notes: true,
                                reviewedAt: true,
                                createdAt: true,
                            },
                        },
                    );
                return {
                    updated,
                    history,
                };
            },
        );
        return NextResponse.json({
            message:
                decision === "VERIFIED"
                    ? "Academic Mate profile verified successfully."
                    : "Academic Mate profile rejected.",
            profile: {
                id: result.updated.id,
                verificationStatus:
                    result.updated
                        .verificationStatus,
                verifiedAt:
                    serializeDate(
                        result.updated.verifiedAt,
                    ),
                verifiedByAdminId:
                    result.updated
                        .verifiedByAdminId,
            },
            verification: {
                id: result.history.id,
                status: result.history.status,
                notes: result.history.notes,
                reviewedAt:
                    serializeDate(
                        result.history.reviewedAt,
                    ),
                createdAt:
                    result.history.createdAt.toISOString(),
            },
        });
    } catch (error) {
        if (
            error instanceof Error &&
            error.message ===
            "VERIFICATION_STATE_CHANGED"
        ) {
            return NextResponse.json(
                {
                    error:
                        "This verification was already processed by another administrator.",
                },
                { status: 409 },
            );
        }
        if (
            error instanceof Error &&
            error.message ===
            "ACADEMIC_MATE_NOT_FOUND"
        ) {
            return NextResponse.json(
                {
                    error:
                        "Academic Mate profile not found.",
                },
                { status: 404 },
            );
        }
        if (
            error instanceof Error &&
            error.message ===
            "ACADEMIC_MATE_NOT_ACTIVE"
        ) {
            return NextResponse.json(
                {
                    error:
                        "The Academic Mate profile is not active.",
                },
                { status: 409 },
            );
        }
        console.error(
            "PATCH /api/admin/academic-mates/verification/[academicMateId] failed:",
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
