import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MATE_OFFERING_RATE_TYPES = [
  "PER_SESSION",
  "PER_HOUR",
  "PER_WEEK",
  "PER_MONTH",
  "PER_COURSE",
  "CUSTOM",
] as const;

type MateOfferingRateType = (typeof MATE_OFFERING_RATE_TYPES)[number];

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_RATE_LENGTH = 13;
const MAX_RATE_DETAILS_LENGTH = 300;

const ALLOWED_POST_FIELDS = new Set([
  "courseId",
  "title",
  "description",
  "rate",
  "currency",
  "sessionDurationMinutes",
  "rateType",
  "rateDetails",
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

  if (!rate || rate.length > MAX_RATE_LENGTH) {
    return false;
  }

  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(rate)) {
    return false;
  }

  return Number(rate) >= 0;
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
    MATE_OFFERING_RATE_TYPES.includes(
      value as MateOfferingRateType,
    )
  );
}

function hasOnlyAllowedFields(body: Record<string, unknown>) {
  return Object.keys(body).every((key) => ALLOWED_POST_FIELDS.has(key));
}

function normalizeRateType(value: unknown): MateOfferingRateType {
  if (isValidRateType(value)) {
    return value;
  }

  return "PER_SESSION";
}

function normalizeRateDetails(
  rateType: MateOfferingRateType,
  value: unknown,
): string | null {
  if (rateType !== "CUSTOM") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const details = value.trim();
  return details.length > 0 ? details : null;
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
      userId: true,
      universityId: true,
      status: true,
      studentProfile: {
        select: {
          id: true,
          programmeYearId: true,
        },
      },
    },
  });
}

async function getCurrentCurriculumCourseIds(programmeYearId: string | null) {
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

  return new Set(programmeCourses.map((programmeCourse) => programmeCourse.courseId));
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
    isOutsideCurrentCurriculum: !currentCurriculumCourseIds.has(offering.courseId),
  };
}

/**
 * GET /api/student/academic-mate/offerings
 *
 * Returns the authenticated user's Academic Mate offerings.
 */
export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const academicMate = await getAcademicMateContext(user.id);

    if (!academicMate) {
      return NextResponse.json(
        { error: "Academic Mate profile not found." },
        { status: 404 },
      );
    }

    const offerings = await prisma.mateOffering.findMany({
      where: {
        academicMateProfileId: academicMate.id,
        universityId: academicMate.universityId,
      },
      orderBy: {
        createdAt: "desc",
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
        academicMate.studentProfile?.programmeYearId ?? null,
      );

    return NextResponse.json({
      offerings: offerings.map((offering) =>
        serializeOffering(offering, currentCurriculumCourseIds),
      ),
    });
  } catch (error) {
    console.error("GET /api/student/academic-mate/offerings failed:", error);

    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/student/academic-mate/offerings
 *
 * Creates an Academic Mate offering.
 */
export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    if (!hasOnlyAllowedFields(body)) {
      return NextResponse.json(
        { error: "Request contains unsupported fields." },
        { status: 400 },
      );
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

    if (!isValidString(courseId, 100)) {
      return NextResponse.json(
        { error: "courseId is required." },
        { status: 400 },
      );
    }

    if (!isValidOptionalString(title, MAX_TITLE_LENGTH)) {
      return NextResponse.json(
        { error: `title must be ${MAX_TITLE_LENGTH} characters or fewer.` },
        { status: 400 },
      );
    }

    if (!isValidOptionalString(description, MAX_DESCRIPTION_LENGTH)) {
      return NextResponse.json(
        {
          error: `description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`,
        },
        { status: 400 },
      );
    }

    if (!isValidRate(rate)) {
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

    if (rateType !== undefined && !isValidRateType(rateType)) {
      return NextResponse.json(
        { error: "rateType is invalid." },
        { status: 400 },
      );
    }

    if (!isValidOptionalString(rateDetails, MAX_RATE_DETAILS_LENGTH)) {
      return NextResponse.json(
        {
          error: `rateDetails must be ${MAX_RATE_DETAILS_LENGTH} characters or fewer.`,
        },
        { status: 400 },
      );
    }

    const normalizedCourseId = courseId.trim();
    const normalizedTitle =
      typeof title === "string" ? title.trim() || null : null;
    const normalizedDescription =
      typeof description === "string" ? description.trim() || null : null;
    const normalizedRate = String(rate).trim();
    const normalizedCurrency =
      typeof currency === "string" ? currency.trim().toUpperCase() : "ZMW";
    const normalizedSessionDuration = sessionDurationMinutes ?? 60;
    const normalizedRateType = normalizeRateType(rateType);
    const normalizedRateDetails = normalizeRateDetails(
      normalizedRateType,
      rateDetails,
    );

    if (
      normalizedRateType === "CUSTOM" &&
      !normalizedRateDetails
    ) {
      return NextResponse.json(
        {
          error: "Describe your custom pricing arrangement.",
        },
        { status: 400 },
      );
    }

    const course = await prisma.course.findFirst({
      where: {
        id: normalizedCourseId,
        universityId: academicMate.universityId,
      },
      select: {
        id: true,
        code: true,
        name: true,
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

    const existingOffering = await prisma.mateOffering.findFirst({
      where: {
        academicMateProfileId: academicMate.id,
        courseId: course.id,
      },
      select: {
        id: true,
      },
    });

    if (existingOffering) {
      return NextResponse.json(
        {
          error: "You already have an Academic Mate offering for this course.",
        },
        { status: 409 },
      );
    }

    const offering = await prisma.mateOffering.create({
      data: {
        academicMateProfileId: academicMate.id,
        universityId: academicMate.universityId,
        courseId: course.id,
        title: normalizedTitle,
        description: normalizedDescription,
        rate: normalizedRate,
        currency: normalizedCurrency,
        sessionDurationMinutes: normalizedSessionDuration,
        rateType: normalizedRateType,
        rateDetails: normalizedRateDetails,
        status: "ACTIVE",
        verificationStatus: "UNVERIFIED",
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
        academicMate.studentProfile?.programmeYearId ?? null,
      );

    return NextResponse.json(
      {
        message: "Academic Mate offering created successfully.",
        offering: serializeOffering(offering, currentCurriculumCourseIds),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/student/academic-mate/offerings failed:", error);

    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}
