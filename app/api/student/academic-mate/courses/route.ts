import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getAuthenticatedUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user ?? null;
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        { status: 401 },
      );
    }

    const academicMate = await prisma.academicMateProfile.findUnique({
      where: {
        userId: user.id,
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
          error: "Your Academic Mate profile is not active.",
        },
        { status: 403 },
      );
    }

    const courses = await prisma.course.findMany({
      where: {
        universityId: academicMate.universityId,
      },
      orderBy: [
        {
          code: "asc",
        },
        {
          name: "asc",
        },
      ],
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    let currentCurriculumCourseIds = new Set<string>();

    if (academicMate.studentProfile?.programmeYearId) {
      const programmeCourses = await prisma.programmeCourse.findMany({
        where: {
          programmeYearId: academicMate.studentProfile.programmeYearId,
        },
        select: {
          courseId: true,
        },
      });

      currentCurriculumCourseIds = new Set(
        programmeCourses.map((programmeCourse) => programmeCourse.courseId),
      );
    }

    return NextResponse.json({
      courses: courses.map((course) => ({
        id: course.id,
        code: course.code,
        name: course.name,
        isCurrentCurriculum: currentCurriculumCourseIds.has(course.id),
      })),
    });
  } catch (error) {
    console.error(
      "GET /api/student/academic-mate/courses failed:",
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