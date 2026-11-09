import { NextResponse } from "next/server";
import { authorizeAdmin, type AdminContext } from "@/lib/admin/guard";
import { recordAudit } from "@/lib/admin/audit";
import { canAccessUniversity as adminCanAccessUniversity } from "@/lib/admin/permissions";
import { prisma } from "@/lib/prisma";
import { blockersForApproval, exceptionProblem, purgeDate } from "@/lib/verification-evidence";
type VerificationDecision = "VERIFIED" | "REJECTED";
function canAccessUniversity(admin: AdminContext, universityId: string) {
    return adminCanAccessUniversity(admin.scope, universityId);
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
        const authResult = await authorizeAdmin("verification:review");
        if (!authResult.ok) {
            return authResult.response;
        }
        const admin = authResult.admin;
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
                    evidence: {
                        orderBy: { createdAt: "asc" },
                        select: {
                            id: true,
                            kind: true,
                            contentType: true,
                            sizeBytes: true,
                            reviewStatus: true,
                            rejectionReason: true,
                            reviewedAt: true,
                            submittedAt: true,
                            createdAt: true,
                            reviewedByAdmin: { select: { user: { select: { name: true } } } },
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
            evidence: academicMate.evidence.map((item) => ({
                id: item.id,
                kind: item.kind,
                contentType: item.contentType,
                sizeBytes: item.sizeBytes,
                reviewStatus: item.reviewStatus,
                rejectionReason: item.rejectionReason,
                reviewedAt: serializeDate(item.reviewedAt),
                reviewedBy: item.reviewedByAdmin?.user.name ?? null,
                uploadedAt: item.createdAt.toISOString(),
            })),
            evidenceBlockers: blockersForApproval(academicMate.evidence),
            canApproveException: admin.role === "PLATFORM_ADMIN",
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
        const authResult = await authorizeAdmin("verification:review");
        if (!authResult.ok) {
            return authResult.response;
        }
        const admin = authResult.admin;
        const requestContext = authResult.context;
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
        const exceptionReason = typeof payload.exceptionReason === "string" ? payload.exceptionReason.trim() : "";
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
                    userId: true,
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
        // An admin who is also an applicant must not approve or reject their own application.
        if (academicMate.userId === admin.userId) {
            return NextResponse.json(
                { error: "This is your own application, so another admin has to review it." },
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
                const evidence = await tx.academicMateEvidence.findMany({
                    where: { academicMateProfileId: academicMate.id },
                    select: { kind: true, reviewStatus: true },
                });
                const blockers = decision === "VERIFIED" ? blockersForApproval(evidence) : [];
                // Missing or unreviewed documents can only be waived by a platform admin, with a written reason that is audited.
                if (blockers.length > 0 && (!exceptionReason || exceptionProblem(admin.role, exceptionReason))) {
                    throw new Error(exceptionReason ? "EXCEPTION_NOT_ALLOWED" : "EVIDENCE_INCOMPLETE");
                }
                const exception = blockers.length > 0;
                // Documents are deleted a while after the decision, by the clean-up script.
                await tx.academicMateEvidence.updateMany({
                    where: { academicMateProfileId: academicMate.id },
                    data: { purgeAfter: purgeDate(decision as VerificationDecision, reviewedAt) },
                });
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
                                    admin.adminId,
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
                                notes: exception ? [`Approved as an exception: ${exceptionReason}`, notes].filter(Boolean).join("\n\n") : notes,
                                reviewedByAdminId:
                                    admin.adminId,
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
                await recordAudit(tx, {
                    actor: admin,
                    action:
                        exception
                            ? "VERIFICATION_EXCEPTION_APPROVED"
                            : decision === "VERIFIED"
                            ? "VERIFICATION_APPROVED"
                            : "VERIFICATION_REJECTED",
                    targetType: "ACADEMIC_MATE",
                    targetId: academicMate.id,
                    universityId: academicMate.universityId,
                    summary:
                        exception
                            ? "Approved an Academic Mate profile as an exception, without all required documents"
                            : decision === "VERIFIED"
                            ? "Approved an Academic Mate profile"
                            : "Rejected an Academic Mate profile",
                    metadata: {
                        decision,
                        notes: notes ?? null,
                        exceptionReason: exception ? exceptionReason : null,
                        waivedRequirements: exception ? blockers.join(" | ") : null,
                    },
                    context: requestContext,
                });
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
        if (error instanceof Error && error.message === "EXCEPTION_NOT_ALLOWED") {
            return NextResponse.json(
                { error: "Only a platform admin can approve without the required documents, and the reason must be at least 20 characters." },
                { status: 403 },
            );
        }
        if (error instanceof Error && error.message === "EVIDENCE_INCOMPLETE") {
            return NextResponse.json(
                { error: "The identity documents have not all been reviewed and accepted. Open the Evidence tab to finish." },
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
