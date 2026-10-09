import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type StudentOnboardingInput = {
  universityId?: unknown;
  schoolId?: unknown;
  programmeId?: unknown;
  programmeYearId?: unknown;
  studentId?: unknown;
  gender?: unknown;
  phoneNumber?: unknown;
};

const MAX_BODY_SIZE = 10_000;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeString(value: string): string {
  return value.trim();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function validateStudentId(
  studentId: string,
  settings: {
    studentIdMinLength: number;
    studentIdMaxLength: number;
    studentIdPrefix: string | null;
    studentIdPattern: string | null;
  },
): string | null {
  if (
    studentId.length < settings.studentIdMinLength ||
    studentId.length > settings.studentIdMaxLength
  ) {
    return `Student ID must be between ${settings.studentIdMinLength} and ${settings.studentIdMaxLength} characters.`;
  }

  if (
    settings.studentIdPrefix &&
    !studentId.startsWith(settings.studentIdPrefix)
  ) {
    return `Student ID must start with ${settings.studentIdPrefix}.`;
  }

  if (settings.studentIdPattern) {
    let pattern: RegExp;

    try {
      pattern = new RegExp(settings.studentIdPattern);
    } catch {
      throw new Error(
        "University student ID validation pattern is invalid. Contact an administrator.",
      );
    }

    if (!pattern.test(studentId)) {
      return "Student ID format is not valid for this university.";
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "You must be signed in to complete onboarding." },
        { status: 401 },
      );
    }

    const contentLength = request.headers.get("content-length");

    if (contentLength && Number(contentLength) > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: "Request body is too large." },
        { status: 413 },
      );
    }

    let body: StudentOnboardingInput;

    try {
      body = (await request.json()) as StudentOnboardingInput;
    } catch {
      return NextResponse.json(
        { error: "Request body must contain valid JSON." },
        { status: 400 },
      );
    }

    const fields = {
      universityId: body.universityId,
      schoolId: body.schoolId,
      programmeId: body.programmeId,
      programmeYearId: body.programmeYearId,
      studentId: body.studentId,
      gender: body.gender,
    };

    for (const [field, value] of Object.entries(fields)) {
      if (!isNonEmptyString(value)) {
        return NextResponse.json(
          { error: `${field} is required.` },
          { status: 400 },
        );
      }
    }

    const universityId = normalizeString(body.universityId as string);
    const schoolId = normalizeString(body.schoolId as string);
    const programmeId = normalizeString(body.programmeId as string);
    const programmeYearId = normalizeString(body.programmeYearId as string);
    const studentId = normalizeString(body.studentId as string);
    const gender = normalizeString(body.gender as string);

    if (gender !== "MALE" && gender !== "FEMALE") {
      return NextResponse.json(
        { error: "Gender must be either MALE or FEMALE." },
        { status: 400 },
      );
    }

    let phoneNumber: string | null = null;

    if (body.phoneNumber !== undefined && body.phoneNumber !== null) {
      if (!isNonEmptyString(body.phoneNumber)) {
        return NextResponse.json(
          { error: "Phone number must be a non-empty string when provided." },
          { status: 400 },
        );
      }

      phoneNumber = normalizeString(body.phoneNumber as string);

      if (phoneNumber.length > 30) {
        return NextResponse.json(
          { error: "Phone number is too long." },
          { status: 400 },
        );
      }
    }

    const existingProfile = await prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (existingProfile) {
      return NextResponse.json(
        { error: "This account already has a student profile." },
        { status: 409 },
      );
    }

    const university = await prisma.university.findUnique({
      where: { id: universityId },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        settings: {
          select: {
            studentIdMinLength: true,
            studentIdMaxLength: true,
            studentIdPrefix: true,
            studentIdPattern: true,
          },
        },
      },
    });

    if (!university || university.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Selected university does not exist or is inactive." },
        { status: 400 },
      );
    }

    if (!university.settings) {
      return NextResponse.json(
        { error: "University onboarding settings are not configured." },
        { status: 409 },
      );
    }

    const studentIdError = validateStudentId(studentId, university.settings);

    if (studentIdError) {
      return NextResponse.json(
        { error: studentIdError },
        { status: 400 },
      );
    }

    const duplicateStudentId = await prisma.studentProfile.findUnique({
      where: {
        universityId_studentId: {
          universityId: university.id,
          studentId,
        },
      },
      select: { id: true },
    });

    if (duplicateStudentId) {
      return NextResponse.json(
        { error: "That student ID is already registered at this university." },
        { status: 409 },
      );
    }

    const school = await prisma.school.findFirst({
      where: {
        id: schoolId,
        universityId: university.id,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!school) {
      return NextResponse.json(
        { error: "Selected school does not belong to this university." },
        { status: 400 },
      );
    }

    const programme = await prisma.programme.findFirst({
      where: {
        id: programmeId,
        universityId: university.id,
        schoolId: school.id,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!programme) {
      return NextResponse.json(
        { error: "Selected programme does not belong to this school and university." },
        { status: 400 },
      );
    }

    const programmeYear = await prisma.programmeYear.findFirst({
      where: {
        id: programmeYearId,
        programmeId: programme.id,
      },
      select: {
        id: true,
        yearNumber: true,
        programmeCourses: {
          select: {
            courseId: true,
            semester: true,
          },
        },
      },
    });

    if (!programmeYear) {
      return NextResponse.json(
        { error: "Selected programme year does not belong to this programme." },
        { status: 400 },
      );
    }

    if (programmeYear.programmeCourses.length === 0) {
      return NextResponse.json(
        { error: "The selected programme year has no configured courses." },
        { status: 409 },
      );
    }

    const currentAcademicYears = await prisma.academicYear.findMany({
      where: {
        universityId: university.id,
        isCurrent: true,
      },
      orderBy: {
        startDate: "desc",
      },
      take: 2,
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
      },
    });

    if (currentAcademicYears.length === 0) {
      return NextResponse.json(
        { error: "This university does not have a current academic year configured." },
        { status: 409 },
      );
    }

    if (currentAcademicYears.length > 1) {
      return NextResponse.json(
        { error: "This university has more than one current academic year. An administrator must resolve the configuration." },
        { status: 409 },
      );
    }

    const academicYear = currentAcademicYears[0];

    const courseIds = programmeYear.programmeCourses.map(
      (programmeCourse) => programmeCourse.courseId,
    );

    const courses = await prisma.course.findMany({
      where: {
        id: { in: courseIds },
        universityId: university.id,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (courses.length !== courseIds.length) {
      return NextResponse.json(
        { error: "The programme curriculum contains a course that is not configured correctly for this university." },
        { status: 409 },
      );
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const profile = await tx.studentProfile.create({
          data: {
            userId: session.user.id,
            universityId: university.id,
            studentId,
            gender: gender as "MALE" | "FEMALE",
            programmeId: programme.id,
            programmeYearId: programmeYear.id,
            phoneNumber,
          },
          select: {
            id: true,
            studentId: true,
            gender: true,
            status: true,
            programme: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            programmeYear: {
              select: {
                id: true,
                yearNumber: true,
              },
            },
          },
        });

        await tx.studentCourse.createMany({
          data: programmeYear.programmeCourses.map((programmeCourse) => ({
            studentProfileId: profile.id,
            courseId: programmeCourse.courseId,
            academicYearId: academicYear.id,
            semester: programmeCourse.semester,
          })),
        });

        return profile;
      });

      return NextResponse.json(
        {
          message: "Student onboarding completed successfully.",
          studentProfile: result,
          academicYear: {
            id: academicYear.id,
            name: academicYear.name,
          },
          courses: courses.map((course) => ({
            id: course.id,
            code: course.code,
            name: course.name,
          })),
        },
        { status: 201 },
      );
    } catch (error) {
      const message = getErrorMessage(error);

      if (message.includes("Unique constraint")) {
        return NextResponse.json(
          { error: "A student profile with these unique details already exists." },
          { status: 409 },
        );
      }

      throw error;
    }
  } catch (error) {
    console.error("Student onboarding failed:", error);

    return NextResponse.json(
      { error: "An unexpected error occurred while completing onboarding." },
      { status: 500 },
    );
  }
}
