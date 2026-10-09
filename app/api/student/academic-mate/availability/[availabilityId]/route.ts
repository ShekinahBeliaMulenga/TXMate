import { NextResponse } from "next/server";
import { Weekday } from "@/generated/prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_FIELDS = new Set([
    "mateOfferingId",
    "day",
    "startMinute",
    "endMinute",
    "timezone",
    "isActive",
]);

const WEEKDAYS = new Set<Weekday>([
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
]);

function isWeekday(value: unknown): value is Weekday {
    return typeof value === "string" && WEEKDAYS.has(value as Weekday);
}

function isPlainObject(
    value: unknown,
): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

function isValidString(
    value: unknown,
    maxLength: number,
): value is string {
    return (
        typeof value === "string" &&
        value.trim().length > 0 &&
        value.trim().length <= maxLength
    );
}

function isValidMinute(value: unknown): value is number {
    return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 1439
    );
}

function isValidTimezone(value: unknown): value is string {
    if (!isValidString(value, 100)) {
        return false;
    }

    try {
        new Intl.DateTimeFormat("en-US", {
            timeZone: value,
        }).format();

        return true;
    } catch {
        return false;
    }
}

function hasOnlyAllowedFields(
    body: Record<string, unknown>,
) {
    return Object.keys(body).every((key) =>
        ALLOWED_FIELDS.has(key),
    );
}

async function getAuthenticatedUser() {
    const session = await auth.api.getSession({
        headers: await import("next/headers").then(
            ({ headers }) => headers(),
        ),
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
        },
    });
}

async function getAvailabilityContext(
    availabilityId: string,
    academicMateProfileId: string,
) {
    return prisma.mateAvailability.findFirst({
        where: {
            id: availabilityId,
            academicMateProfileId,
        },
        select: {
            id: true,
            academicMateProfileId: true,
            mateOfferingId: true,
            day: true,
            startMinute: true,
            endMinute: true,
            timezone: true,
            isActive: true,
            mateOffering: {
                select: {
                    id: true,
                    academicMateProfileId: true,
                    universityId: true,
                    sessionDurationMinutes: true,
                    status: true,
                },
            },
        },
    });
}

/**
 * PATCH /api/student/academic-mate/availability/[availabilityId]
 *
 * Updates an availability period.
 */
export async function PATCH(
    request: Request,
    context: {
        params: Promise<{
            availabilityId: string;
        }>;
    },
) {
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

        const { availabilityId } = await context.params;

        if (!isValidString(availabilityId, 100)) {
            return NextResponse.json(
                {
                    error: "Invalid availability ID.",
                },
                { status: 400 },
            );
        }

        const academicMate =
            await getAcademicMateContext(user.id);

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
                        "Your Academic Mate profile is not active.",
                },
                { status: 403 },
            );
        }

        const existing =
            await getAvailabilityContext(
                availabilityId,
                academicMate.id,
            );

        if (!existing) {
            return NextResponse.json(
                {
                    error: "Availability period not found.",
                },
                { status: 404 },
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

        if (!isPlainObject(body)) {
            return NextResponse.json(
                {
                    error:
                        "Request body must be a JSON object.",
                },
                { status: 400 },
            );
        }

        if (!hasOnlyAllowedFields(body)) {
            return NextResponse.json(
                {
                    error:
                        "Request contains unsupported fields.",
                },
                { status: 400 },
            );
        }

        const hasMateOfferingId =
            Object.prototype.hasOwnProperty.call(
                body,
                "mateOfferingId",
            );

        const hasDay = Object.prototype.hasOwnProperty.call(
            body,
            "day",
        );

        const hasStartMinute =
            Object.prototype.hasOwnProperty.call(
                body,
                "startMinute",
            );

        const hasEndMinute =
            Object.prototype.hasOwnProperty.call(
                body,
                "endMinute",
            );

        const hasTimezone =
            Object.prototype.hasOwnProperty.call(
                body,
                "timezone",
            );

        const hasIsActive =
            Object.prototype.hasOwnProperty.call(
                body,
                "isActive",
            );

        const mateOfferingId = hasMateOfferingId
            ? body.mateOfferingId
            : existing.mateOfferingId;

        const day = hasDay ? body.day : existing.day;

        const startMinute = hasStartMinute
            ? body.startMinute
            : existing.startMinute;

        const endMinute = hasEndMinute
            ? body.endMinute
            : existing.endMinute;

        const timezone = hasTimezone
            ? body.timezone
            : existing.timezone;

        const isActive = hasIsActive
            ? body.isActive
            : existing.isActive;

        if (!isValidString(mateOfferingId, 100)) {
            return NextResponse.json(
                {
                    error: "A valid offering is required.",
                },
                { status: 400 },
            );
        }

        if (!isWeekday(day)) {
            return NextResponse.json(
                {
                    error:
                        "A valid day of the week is required.",
                },
                { status: 400 },
            );
        }

        if (!isValidMinute(startMinute)) {
            return NextResponse.json(
                {
                    error:
                        "Start time must be a valid minute between 0 and 1439.",
                },
                { status: 400 },
            );
        }

        if (!isValidMinute(endMinute)) {
            return NextResponse.json(
                {
                    error:
                        "End time must be a valid minute between 0 and 1439.",
                },
                { status: 400 },
            );
        }

        if (endMinute <= startMinute) {
            return NextResponse.json(
                {
                    error:
                        "End time must be later than start time.",
                },
                { status: 400 },
            );
        }

        if (!isValidTimezone(timezone)) {
            return NextResponse.json(
                {
                    error:
                        "A valid IANA timezone is required.",
                },
                { status: 400 },
            );
        }

        if (typeof isActive !== "boolean") {
            return NextResponse.json(
                {
                    error: "isActive must be a boolean.",
                },
                { status: 400 },
            );
        }

        /**
         * The selected offering must belong to the
         * authenticated Academic Mate.
         */
        const offering =
            await prisma.mateOffering.findFirst({
                where: {
                    id: mateOfferingId,
                    academicMateProfileId: academicMate.id,
                    universityId: academicMate.universityId,
                },
                select: {
                    id: true,
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
            });

        if (!offering) {
            return NextResponse.json(
                {
                    error:
                        "The selected offering does not belong to your Academic Mate profile.",
                },
                { status: 404 },
            );
        }

        /**
         * Active availability can only be attached to
         * an active offering.
         */
        if (
            isActive &&
            offering.status !== "ACTIVE"
        ) {
            return NextResponse.json(
                {
                    error:
                        "Availability can only be activated for an active offering.",
                },
                { status: 400 },
            );
        }

        /**
         * The availability period must exactly match
         * the selected offering's session length.
         */
        const duration = endMinute - startMinute;

        if (
            duration !== offering.sessionDurationMinutes
        ) {
            return NextResponse.json(
                {
                    error: `This offering has a ${offering.sessionDurationMinutes}-minute session length. Availability must be exactly ${offering.sessionDurationMinutes} minutes.`,
                },
                { status: 400 },
            );
        }

        /**
         * Only active availability blocks overlapping
         * active availability.
         */
        if (isActive) {
            const overlappingAvailability =
                await prisma.mateAvailability.findFirst({
                    where: {
                        id: {
                            not: existing.id,
                        },
                        mateOfferingId: offering.id,
                        day,
                        isActive: true,
                        startMinute: {
                            lt: endMinute,
                        },
                        endMinute: {
                            gt: startMinute,
                        },
                    },
                    select: {
                        id: true,
                    },
                });

            if (overlappingAvailability) {
                return NextResponse.json(
                    {
                        error:
                            "This availability overlaps with another availability period for the same offering.",
                    },
                    { status: 409 },
                );
            }
        }

        /**
         * Prevent an exact duplicate.
         */
        const duplicate =
            await prisma.mateAvailability.findFirst({
                where: {
                    id: {
                        not: existing.id,
                    },
                    mateOfferingId: offering.id,
                    day,
                    startMinute,
                    endMinute,
                },
                select: {
                    id: true,
                },
            });

        if (duplicate) {
            return NextResponse.json(
                {
                    error:
                        "This availability period already exists for the selected offering.",
                },
                { status: 409 },
            );
        }

        const updated =
            await prisma.mateAvailability.update({
                where: {
                    id: existing.id,
                },
                data: {
                    mateOfferingId: offering.id,
                    day,
                    startMinute,
                    endMinute,
                    timezone,
                    isActive,
                },
                include: {
                    mateOffering: {
                        select: {
                            id: true,
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
                },
            });

        return NextResponse.json({
            availability: updated,
        });
    } catch (error) {
        console.error(
            "PATCH /api/student/academic-mate/availability/[availabilityId] failed:",
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
 * DELETE /api/student/academic-mate/availability/[availabilityId]
 *
 * Deletes an availability period belonging to the
 * authenticated Academic Mate.
 */
export async function DELETE(
    _request: Request,
    context: {
        params: Promise<{
            availabilityId: string;
        }>;
    },
) {
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

        const { availabilityId } = await context.params;

        if (!isValidString(availabilityId, 100)) {
            return NextResponse.json(
                {
                    error: "Invalid availability ID.",
                },
                { status: 400 },
            );
        }

        const academicMate =
            await getAcademicMateContext(user.id);

        if (!academicMate) {
            return NextResponse.json(
                {
                    error: "Academic Mate profile not found.",
                },
                { status: 404 },
            );
        }

        const existing =
            await prisma.mateAvailability.findFirst({
                where: {
                    id: availabilityId,
                    academicMateProfileId: academicMate.id,
                },
                select: {
                    id: true,
                },
            });

        if (!existing) {
            return NextResponse.json(
                {
                    error: "Availability period not found.",
                },
                { status: 404 },
            );
        }

        await prisma.mateAvailability.delete({
            where: {
                id: existing.id,
            },
        });

        return NextResponse.json({
            message: "Availability period deleted.",
        });
    } catch (error) {
        console.error(
            "DELETE /api/student/academic-mate/availability/[availabilityId] failed:",
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