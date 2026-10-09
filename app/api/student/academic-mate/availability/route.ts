import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

import { prisma } from "@/lib/prisma";
import { Weekday } from "@/generated/prisma/client";

const ALLOWED_FIELDS = new Set([

    "mateOfferingId",

    "day",

    "startMinute",

    "endMinute",

    "timezone",

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

/**

 * GET /api/student/academic-mate/availability

 *

 * Returns all availability periods belonging to the

 * authenticated Academic Mate.

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

        const academicMate = await getAcademicMateContext(

            user.id,

        );

        if (!academicMate) {

            return NextResponse.json(

                {

                    error: "Academic Mate profile not found.",

                },

                { status: 404 },

            );

        }

        const availability =

            await prisma.mateAvailability.findMany({

                where: {

                    academicMateProfileId: academicMate.id,

                },

                orderBy: [

                    {

                        day: "asc",

                    },

                    {

                        startMinute: "asc",

                    },

                ],

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

            availability,

        });

    } catch (error) {

        console.error(

            "GET /api/student/academic-mate/availability failed:",

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

 * POST /api/student/academic-mate/availability

 *

 * Creates an availability period for a specific offering.

 *

 * The period MUST exactly match the offering's

 * sessionDurationMinutes.

 */

export async function POST(request: Request) {

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

        const academicMate = await getAcademicMateContext(

            user.id,

        );

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

        const {

            mateOfferingId,

            day,

            startMinute,

            endMinute,

            timezone,

        } = body;

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

                    error: "A valid day of the week is required.",

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

        /*

         * The offering must belong to this Academic Mate.

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

                    course: {

                        select: {

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

        if (offering.status !== "ACTIVE") {

            return NextResponse.json(

                {

                    error:

                        "Availability can only be added to an active offering.",

                },

                { status: 400 },

            );

        }

        /*

         * The availability period must exactly match

         * the offering's session length.

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

        /*

         * Prevent overlapping availability for the same

         * offering and day.

         *

         * Existing:

         * 15:00 - 16:00

         *

         * New:

         * 15:30 - 16:30

         *

         * => rejected.

         *

         * 16:00 - 17:00

         *

         * => allowed.

         */

        const overlappingAvailability =

            await prisma.mateAvailability.findFirst({

                where: {

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

        /*

         * Exact duplicate protection.

         *

         * This also gives a clearer application-level

         * response than relying only on the database

         * unique constraint.

         */

        const duplicate =

            await prisma.mateAvailability.findFirst({

                where: {

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

        const created =

            await prisma.mateAvailability.create({

                data: {

                    academicMateProfileId: academicMate.id,

                    mateOfferingId: offering.id,

                    day,

                    startMinute,

                    endMinute,

                    timezone,

                    isActive: true,

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

        return NextResponse.json(

            {

                availability: created,

            },

            { status: 201 },

        );

    } catch (error) {

        console.error(

            "POST /api/student/academic-mate/availability failed:",

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
