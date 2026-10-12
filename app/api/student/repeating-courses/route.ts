import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getStudentContext(userId: string) {
  const student = await prisma.studentProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      universityId: true,
      programmeId: true,
      status: true,
    },
  });

  if (!student) {
    return {
      error: "Student profile not found. Complete onboarding first.",
      status: 404 as const,
    };
  }

  if (student.status !== "ACTIVE") {
    return { error: "Your student account is not active.", status: 403 as const };
  }

  const currentYears = await prisma.academicYear.findMany({
    where: { universityId: student.universityId, isCurrent: true },
    orderBy: { startDate: "desc" },
    take: 2,
    select: { id: true, name: true },
  });

  if (currentYears.length === 0) {
    return {
      error: "Your university has no current academic year configured.",
      status: 409 as const,
    };
  }

  if (currentYears.length > 1) {
    return {
      error: "Your university has multiple current academic years. An administrator must resolve this configuration.",
      status: 409 as const,
    };
  }

  return { student, academicYear: currentYears[0] };
}

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be signed in to manage repeating courses." },
        { status: 401 },
      );
    }

    const context = await getStudentContext(session.user.id);

    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const { student, academicYear: currentAcademicYear } = context;
    const requestedYearId = new URL(request.url).searchParams.get("academicYearId")?.trim();

    const academicYears = await prisma.academicYear.findMany({
      where: { universityId: student.universityId },
      orderBy: [{ startDate: "desc" }, { name: "desc" }],
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        isCurrent: true,
      },
    });

    const selectedAcademicYear = requestedYearId
      ? academicYears.find((year) => year.id === requestedYearId)
      : academicYears.find((year) => year.isCurrent);

    if (!selectedAcademicYear) {
      return NextResponse.json(
        { error: "The selected academic year is not available." },
        { status: 404 },
      );
    }

    const [courses, yearCourses, programmeYears] = await Promise.all([
      prisma.course.findMany({
        where: { universityId: student.universityId, isActive: true },
        orderBy: [{ code: "asc" }, { name: "asc" }],
        select: { id: true, code: true, name: true },
      }),
      prisma.studentCourse.findMany({
        where: {
          studentProfileId: student.id,
          academicYearId: selectedAcademicYear.id,
        },
        orderBy: { course: { code: "asc" } },
        select: {
          id: true,
          courseId: true,
          status: true,
          semester: true,
          course: { select: { id: true, code: true, name: true } },
        },
      }),
      prisma.programmeYear.findMany({
        where: { programmeId: student.programmeId },
        orderBy: { yearNumber: "asc" },
        select: {
          yearNumber: true,
          programmeCourses: { select: { courseId: true } },
        },
      }),
    ]);

    const courseYearsById = new Map<string, number[]>();

    for (const year of programmeYears) {
      for (const programmeCourse of year.programmeCourses) {
        const years = courseYearsById.get(programmeCourse.courseId) ?? [];
        if (!years.includes(year.yearNumber)) years.push(year.yearNumber);
        courseYearsById.set(programmeCourse.courseId, years);
      }
    }

    const getProgrammeYears = (courseId: string) =>
      [...(courseYearsById.get(courseId) ?? [])].sort((a, b) => a - b);

    return NextResponse.json({
      academicYear: selectedAcademicYear,
      currentAcademicYearId: currentAcademicYear.id,
      academicYears,
      programmeYears: programmeYears.map((year) => year.yearNumber),
      courses: courses.map((course) => ({
        ...course,
        programmeYears: getProgrammeYears(course.id),
      })),
      yearCourses: yearCourses.map((record) => ({
        ...record,
        course: {
          ...record.course,
          programmeYears: getProgrammeYears(record.course.id),
        },
      })),
    });
  } catch (error) {
    console.error("GET /api/student/repeating-courses failed:", error);
    return NextResponse.json(
      { error: "Unable to load your courses." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be signed in to manage repeating courses." },
        { status: 401 },
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

    if (
      !isPlainObject(body) ||
      Object.keys(body).length !== 1 ||
      typeof body.courseId !== "string" ||
      !body.courseId.trim() ||
      body.courseId.length > 100
    ) {
      return NextResponse.json(
        { error: "A valid courseId is required." },
        { status: 400 },
      );
    }

    const courseId = body.courseId.trim();
    const context = await getStudentContext(session.user.id);

    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const { student, academicYear } = context;
    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        universityId: student.universityId,
        isActive: true,
      },
      select: { id: true, code: true, name: true },
    });

    if (!course) {
      return NextResponse.json(
        { error: "This course is unavailable at your university." },
        { status: 404 },
      );
    }

    const existing = await prisma.studentCourse.findUnique({
      where: {
        studentProfileId_courseId_academicYearId: {
          studentProfileId: student.id,
          courseId: course.id,
          academicYearId: academicYear.id,
        },
      },
      select: { id: true, status: true },
    });

    if (existing?.status === "REPEATING") {
      return NextResponse.json(
        { error: "This course is already marked as repeating." },
        { status: 409 },
      );
    }

    const studentCourse = await prisma.studentCourse.upsert({
      where: {
        studentProfileId_courseId_academicYearId: {
          studentProfileId: student.id,
          courseId: course.id,
          academicYearId: academicYear.id,
        },
      },
      create: {
        studentProfileId: student.id,
        courseId: course.id,
        academicYearId: academicYear.id,
        status: "REPEATING",
      },
      update: { status: "REPEATING" },
      select: {
        id: true,
        courseId: true,
        status: true,
        semester: true,
        course: { select: { id: true, code: true, name: true } },
      },
    });

    return NextResponse.json(
      {
        message: `${course.code} has been marked as a repeating course.`,
        studentCourse,
      },
      { status: existing ? 200 : 201 },
    );
  } catch (error) {
    console.error("POST /api/student/repeating-courses failed:", error);
    return NextResponse.json(
      { error: "Unable to mark this course as repeating." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be signed in to manage repeating courses." },
        { status: 401 },
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

    if (
      !isPlainObject(body) ||
      Object.keys(body).length !== 1 ||
      typeof body.courseId !== "string" ||
      !body.courseId.trim() ||
      body.courseId.length > 100
    ) {
      return NextResponse.json(
        { error: "A valid courseId is required." },
        { status: 400 },
      );
    }

    const courseId = body.courseId.trim();
    const context = await getStudentContext(session.user.id);

    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: context.status });
    }

    const { student, academicYear } = context;
    const result = await prisma.studentCourse.updateMany({
      where: {
        studentProfileId: student.id,
        courseId,
        academicYearId: academicYear.id,
        status: "REPEATING",
        course: { universityId: student.universityId },
      },
      data: { status: "DROPPED" },
    });

    if (result.count !== 1) {
      return NextResponse.json(
        { error: "This course is not currently marked as repeating for this academic year." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      message: "The course is no longer marked as repeating.",
      courseId,
      status: "DROPPED",
    });
  } catch (error) {
    console.error("PATCH /api/student/repeating-courses failed:", error);
    return NextResponse.json(
      { error: "Unable to update this repeating course." },
      { status: 500 },
    );
  }
}