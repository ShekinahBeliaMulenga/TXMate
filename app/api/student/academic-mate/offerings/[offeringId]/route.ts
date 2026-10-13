import { MateOfferingRateType } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_RATE_LENGTH = 13;
const MAX_RATE_DETAILS_LENGTH = 300;

const ALLOWED_FIELDS = new Set([
    "courseId",
    "title",
    "description",
    "rate",
    "currency",
    "sessionDurationMinutes",
    "rateType",
    "rateDetails",
    "status",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidString(value: unknown, maxLength: number): value is string {
    return (
        typeof value === "string" &&
        value.trim().length > 0 &&
        value.trim().length <= maxLength
    );
}

function isValidOptionalString(
    value: unknown,
    maxLength: number,
): value is string | null {
    return (
        value === null ||
        value === undefined ||
        (typeof value === "string" && value.trim().length <= maxLength)
    );
}

function isValidRate(value: unknown): value is string | number {
    if (typeof value !== "string" && typeof value !== "number") {
        return false;
    }

    const rate = String(value).trim();

    return (
        rate.length > 0 &&
        rate.length <= MAX_RATE_LENGTH &&
        /^\d{1,10}(?:\.\d{1,2})?$/.test(rate) &&
        Number(rate) >= 0
    );
}

function isValidSessionDuration(value: unknown): value is number {
    return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= 1440
    );
}

function isValidRateType(value: unknown): value is MateOfferingRateType {
    return (
        typeof value === "string" &&
        Object.values(MateOfferingRateType).includes(
            value as MateOfferingRateType,
        )
    );
}

async function getAuthenticatedUser() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    return session?.user ?? null;
}

async function getAcademicMateContext(userId: string) {
    return prisma.academicMateProfile.findUnique({
        where: {
            userId,
        },
        select: {
            id: true,
            universityId: true,
            status: true,
            studentProfile: {
                select: {
                    programmeYearId: true,
                },
            },
        },
    });
}

async function getOfferingForMate(
    offeringId: string,
    academicMateProfileId: string,
    universityId: string,
) {
    return prisma.mateOffering.findFirst({
        where: {
            id: offeringId,
            academicMateProfileId,
            universityId,
        },
        include: {
            course: {
                select: {
                    id: true,
                    code: true,
                    name: true,
                },
            },
        },
    });
}

async function getCurrentCurriculumCourseIds(
    programmeYearId: string | null,
) {
    if (!programmeYearId) {
        return new Set<string>();
    }

    const programmeCourses = await prisma.programmeCourse.findMany({
        where: {
            programmeYearId,
        },
        select: {
            courseId: true,
        },
    });

    return new Set(
        programmeCourses.map((programmeCourse) => programmeCourse.courseId),
    );
}

function serializeOffering(
    offering: {
        id: string;
        courseId: string;
        title: string | null;
        description: string | null;
        rate: { toString(): string };
        currency: string;
        sessionDurationMinutes: number;
        rateType: MateOfferingRateType;
        rateDetails: string | null;
        status: string;
        verificationStatus: string;
        createdAt: Date;
        updatedAt: Date;
        course: {
            id: string;
            code: string;
            name: string;
        };
    },
    currentCurriculumCourseIds: Set<string>,
) {
    return {
        id: offering.id,
        course: offering.course,
        title: offering.title,
        description: offering.description,
        rate: offering.rate.toString(),
        currency: offering.currency,
        sessionDurationMinutes: offering.sessionDurationMinutes,
        rateType: offering.rateType,
        rateDetails: offering.rateDetails,
        status: offering.status,
        verificationStatus: offering.verificationStatus,
        createdAt: offering.createdAt,
        updatedAt: offering.updatedAt,
        isOutsideCurrentCurriculum: !currentCurriculumCourseIds.has(
            offering.courseId,
        ),
    };
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ offeringId: string }> },
) {
    try {
        const user = await getAuthenticatedUser();

        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        const { offeringId } = await params;

        if (!offeringId) {
            return NextResponse.json(
                { error: "Offering ID is required." },
                { status: 400 },
            );
        }

        const academicMate = await getAcademicMateContext(user.id);

        if (!academicMate) {
            return NextResponse.json(
                { error: "Academic Mate profile not found." },
                { status: 404 },
            );
        }

        if (academicMate.status !== "ACTIVE") {
            return NextResponse.json(
                { error: "Your Academic Mate profile is not active." },
                { status: 403 },
            );
        }

        const existingOffering = await getOfferingForMate(
            offeringId,
            academicMate.id,
            academicMate.universityId,
        );

        if (!existingOffering) {
            return NextResponse.json(
                { error: "Offering not found." },
                { status: 404 },
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

        if (!isPlainObject(body)) {
            return NextResponse.json(
                { error: "Request body must be a JSON object." },
                { status: 400 },
            );
        }

        if (Object.keys(body).length === 0) {
            return NextResponse.json(
                {
                    error:
                        "At least one field is required to update the offering.",
                },
                { status: 400 },
            );
        }

        if (!Object.keys(body).every((key) => ALLOWED_FIELDS.has(key))) {
            return NextResponse.json(
                { error: "Request contains unsupported fields." },
                { status: 400 },
            );
        }

        /* Reactivation: a mate can switch their own INACTIVE offering back to ACTIVE.
           This is handled on its own and cannot be combined with other edits. */
        if ("status" in body) {
            if (Object.keys(body).length !== 1) {
                return NextResponse.json(
                    { error: "Status must be updated on its own." },
                    { status: 400 },
                );
            }

            if (body.status !== "ACTIVE") {
                return NextResponse.json(
                    { error: "Only reactivating an offering is supported." },
                    { status: 400 },
                );
            }

            // Suspended offerings are controlled by admins, so a mate cannot reactivate them.
            if (
                existingOffering.status !== "INACTIVE" &&
                existingOffering.status !== "ACTIVE"
            ) {
                return NextResponse.json(
                    { error: "This offering cannot be reactivated." },
                    { status: 403 },
                );
            }

            const reactivatedOffering =
                existingOffering.status === "ACTIVE"
                    ? existingOffering
                    : await prisma.mateOffering.update({
                        where: {
                            id: existingOffering.id,
                        },
                        data: {
                            status: "ACTIVE",
                        },
                        include: {
                            course: {
                                select: {
                                    id: true,
                                    code: true,
                                    name: true,
                                },
                            },
                        },
                    });

            const reactivationCurriculumCourseIds =
                await getCurrentCurriculumCourseIds(
                    academicMate.studentProfile?.programmeYearId ?? null,
                );

            return NextResponse.json({
                message: "Offering reactivated successfully.",
                offering: serializeOffering(
                    reactivatedOffering,
                    reactivationCurriculumCourseIds,
                ),
            });
        }

        const {
            courseId,
            title,
            description,
            rate,
            currency,
            sessionDurationMinutes,
            rateType,
            rateDetails,
        } = body;

        if (
            courseId !== undefined &&
            !isValidString(courseId, 100)
        ) {
            return NextResponse.json(
                { error: "courseId must be a valid course ID." },
                { status: 400 },
            );
        }

        if (
            title !== undefined &&
            !isValidOptionalString(title, MAX_TITLE_LENGTH)
        ) {
            return NextResponse.json(
                {
                    error: `title must be ${MAX_TITLE_LENGTH} characters or fewer.`,
                },
                { status: 400 },
            );
        }

        if (
            description !== undefined &&
            !isValidOptionalString(
                description,
                MAX_DESCRIPTION_LENGTH,
            )
        ) {
            return NextResponse.json(
                {
                    error: `description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`,
                },
                { status: 400 },
            );
        }

        if (rate !== undefined && !isValidRate(rate)) {
            return NextResponse.json(
                {
                    error:
                        "rate must be a valid non-negative amount with no more than 10 digits before the decimal point and 2 digits after it.",
                },
                { status: 400 },
            );
        }

        if (
            currency !== undefined &&
            (typeof currency !== "string" ||
                currency.trim().length < 1 ||
                currency.trim().length > 10)
        ) {
            return NextResponse.json(
                { error: "currency must be a valid currency code." },
                { status: 400 },
            );
        }

        if (
            sessionDurationMinutes !== undefined &&
            !isValidSessionDuration(sessionDurationMinutes)
        ) {
            return NextResponse.json(
                {
                    error:
                        "sessionDurationMinutes must be an integer between 1 and 1440.",
                },
                { status: 400 },
            );
        }

        if (
            rateType !== undefined &&
            !isValidRateType(rateType)
        ) {
            return NextResponse.json(
                { error: "rateType is invalid." },
                { status: 400 },
            );
        }

        if (
            rateDetails !== undefined &&
            !isValidOptionalString(
                rateDetails,
                MAX_RATE_DETAILS_LENGTH,
            )
        ) {
            return NextResponse.json(
                {
                    error: `rateDetails must be ${MAX_RATE_DETAILS_LENGTH} characters or fewer.`,
                },
                { status: 400 },
            );
        }

        const nextRateType =
            rateType !== undefined
                ? rateType
                : existingOffering.rateType;

        if (
            nextRateType === MateOfferingRateType.CUSTOM &&
            rateDetails !== undefined &&
            (!rateDetails ||
                typeof rateDetails !== "string" ||
                !rateDetails.trim())
        ) {
            return NextResponse.json(
                {
                    error:
                        "Describe your custom pricing arrangement.",
                },
                { status: 400 },
            );
        }

        if (
            nextRateType === MateOfferingRateType.CUSTOM &&
            rateDetails === undefined &&
            !existingOffering.rateDetails
        ) {
            return NextResponse.json(
                {
                    error:
                        "Describe your custom pricing arrangement.",
                },
                { status: 400 },
            );
        }

        const nextCourseId =
            typeof courseId === "string"
                ? courseId.trim()
                : existingOffering.courseId;

        const course = await prisma.course.findFirst({
            where: {
                id: nextCourseId,
                universityId: academicMate.universityId,
            },
            select: {
                id: true,
            },
        });

        if (!course) {
            return NextResponse.json(
                {
                    error:
                        "The selected course does not belong to your university or does not exist.",
                },
                { status: 400 },
            );
        }

        if (course.id !== existingOffering.courseId) {
            const duplicate =
                await prisma.mateOffering.findFirst({
                    where: {
                        academicMateProfileId: academicMate.id,
                        courseId: course.id,
                        id: {
                            not: existingOffering.id,
                        },
                    },
                    select: {
                        id: true,
                    },
                });

            if (duplicate) {
                return NextResponse.json(
                    {
                        error:
                            "You already have an Academic Mate offering for this course.",
                    },
                    { status: 409 },
                );
            }
        }

        const updatedOffering =
            await prisma.mateOffering.update({
                where: {
                    id: existingOffering.id,
                },
                data: {
                    ...(courseId !== undefined
                        ? { courseId: course.id }
                        : {}),

                    ...(title !== undefined
                        ? {
                            title:
                                typeof title === "string"
                                    ? title.trim() || null
                                    : null,
                        }
                        : {}),

                    ...(description !== undefined
                        ? {
                            description:
                                typeof description === "string"
                                    ? description.trim() || null
                                    : null,
                        }
                        : {}),

                    ...(rate !== undefined
                        ? { rate: String(rate).trim() }
                        : {}),

                    ...(currency !== undefined
                        ? {
                            currency: String(currency)
                                .trim()
                                .toUpperCase(),
                        }
                        : {}),

                    ...(sessionDurationMinutes !== undefined
                        ? { sessionDurationMinutes }
                        : {}),

                    ...(rateType !== undefined
                        ? { rateType: nextRateType }
                        : {}),

                    ...(nextRateType ===
                        MateOfferingRateType.CUSTOM
                        ? {
                            rateDetails:
                                rateDetails !== undefined
                                    ? typeof rateDetails === "string"
                                        ? rateDetails.trim() || null
                                        : null
                                    : existingOffering.rateDetails,
                        }
                        : {
                            rateDetails: null,
                        }),
                },

                include: {
                    course: {
                        select: {
                            id: true,
                            code: true,
                            name: true,
                        },
                    },
                },
            });

        const currentCurriculumCourseIds =
            await getCurrentCurriculumCourseIds(
                academicMate.studentProfile
                    ?.programmeYearId ?? null,
            );

        return NextResponse.json({
            message:
                "Academic Mate offering updated successfully.",
            offering: serializeOffering(
                updatedOffering,
                currentCurriculumCourseIds,
            ),
        });
    } catch (error) {
        console.error(
            "PATCH /api/student/academic-mate/offerings/[offeringId] failed:",
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

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ offeringId: string }> },
) {
    try {
        const user = await getAuthenticatedUser();

        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 },
            );
        }

        const { offeringId } = await params;

        if (!offeringId) {
            return NextResponse.json(
                { error: "Offering ID is required." },
                { status: 400 },
            );
        }

        const academicMate = await getAcademicMateContext(user.id);

        if (!academicMate) {
            return NextResponse.json(
                { error: "Academic Mate profile not found." },
                { status: 404 },
            );
        }

        const offering = await getOfferingForMate(
            offeringId,
            academicMate.id,
            academicMate.universityId,
        );

        if (!offering) {
            return NextResponse.json(
                { error: "Offering not found." },
                { status: 404 },
            );
        }

        const requestCount = await prisma.mateRequest.count({
            where: {
                offeringId: offering.id,
            },
        });

        // Offerings that already have requests or bookings are kept, but hidden from students.
        if (requestCount > 0) {
            await prisma.mateOffering.update({
                where: {
                    id: offering.id,
                },
                data: {
                    status: "INACTIVE",
                },
            });

            return NextResponse.json({
                message:
                    "Offering deactivated. Existing requests and bookings have been preserved.",
                deactivated: true,
            });
        }

        await prisma.mateOffering.delete({
            where: {
                id: offering.id,
            },
        });

        return NextResponse.json({
            message: "Offering deleted successfully.",
            deactivated: false,
        });
    } catch (error) {
        console.error(
            "DELETE /api/student/academic-mate/offerings/[offeringId] failed:",
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