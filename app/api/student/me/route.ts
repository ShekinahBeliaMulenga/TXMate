import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileVisibility = "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";

function isProfileVisibility(value: unknown): value is ProfileVisibility {
  return value === "PUBLIC" || value === "MEMBERS_ONLY" || value === "PRIVATE";
}

function isValidName(value: string) {
  if (value.length < 2 || value.length > 100) return false;
  if (/\p{Cc}/u.test(value)) return false;
  return /\p{L}/u.test(value);
}

function isValidPhone(value: string) {
  if (value.length < 7 || value.length > 30) return false;
  return /^[0-9+().\-\s]+$/.test(value);
}

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "You must be signed in to view your student profile." },
        { status: 401 },
      );
    }

    const profile = await prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        studentId: true,
        gender: true,
        status: true,
        phoneNumber: true,
        bio: true,
        profileVisibility: true,
        showStudentId: true,
        showPhoneNumber: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
        university: {
          select: { id: true, code: true, name: true, slug: true },
        },
        programme: {
          select: {
            id: true,
            code: true,
            name: true,
            level: true,
            durationYears: true,
            school: { select: { id: true, code: true, name: true } },
          },
        },
        programmeYear: { select: { id: true, yearNumber: true } },
        courses: {
          orderBy: { course: { code: "asc" } },
          select: {
            id: true,
            semester: true,
            status: true,
            course: {
              select: {
                id: true,
                code: true,
                name: true,
                description: true,
                credits: true,
              },
            },
            academicYear: {
              select: {
                id: true,
                name: true,
                startDate: true,
                endDate: true,
                isCurrent: true,
              },
            },
          },
        },
      },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "Student profile not found. Complete onboarding first." },
        { status: 404 },
      );
    }

    /*
     * Load the Academic Mate identity directly by userId.
     *
     * This is intentional because AcademicMateProfile has its own
     * unique userId relation. It ensures the student is recognised
     * as an Academic Mate even when studentProfileId is not linked.
     */
    const academicMate = await prisma.academicMateProfile.findUnique({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
        status: true,
        verificationStatus: true,
      },
    });

    const programmeCourses = await prisma.programmeCourse.findMany({
      where: { programmeYearId: profile.programmeYear.id },
      select: {
        courseId: true,
        isCompulsory: true,
        electiveGroup: {
          select: { id: true, name: true, minSelections: true, maxSelections: true },
        },
      },
    });

    const curriculumByCourseId = new Map(
      programmeCourses.map((item) => [item.courseId, item]),
    );

    const courses = profile.courses.map((studentCourse) => {
      const curriculum = curriculumByCourseId.get(studentCourse.course.id);
      return {
        id: studentCourse.id,
        semester: studentCourse.semester,
        status: studentCourse.status,
        isCompulsory: curriculum?.isCompulsory ?? false,
        electiveGroup: curriculum?.electiveGroup ?? null,
        course: studentCourse.course,
        academicYear: studentCourse.academicYear,
      };
    });

    const currentAcademicYear =
      courses.find((course) => course.academicYear.isCurrent)?.academicYear ??
      courses[0]?.academicYear ??
      null;

    return NextResponse.json({
      studentProfile: {
        id: profile.id,
        studentId: profile.studentId,
        gender: profile.gender,
        status: profile.status,
        phoneNumber: profile.phoneNumber,
        bio: profile.bio,
        profileVisibility: profile.profileVisibility,
        showStudentId: profile.showStudentId,
        showPhoneNumber: profile.showPhoneNumber,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
      user: profile.user,
      academicMate,
      university: profile.university,
      academic: {
        school: profile.programme.school,
        programme: {
          id: profile.programme.id,
          code: profile.programme.code,
          name: profile.programme.name,
          level: profile.programme.level,
          durationYears: profile.programme.durationYears,
        },
        year: profile.programmeYear,
        currentAcademicYear,
        courses,
      },
    });
  } catch (error) {
    console.error("Student profile GET failed:", error);
    return NextResponse.json(
      { error: "Unable to load your student profile." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json(
        { error: "You must be signed in to update your profile." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phoneNumber =
      body.phoneNumber === null || body.phoneNumber === undefined
        ? ""
        : typeof body.phoneNumber === "string"
          ? body.phoneNumber.trim()
          : null;
    const bio =
      body.bio === null || body.bio === undefined
        ? ""
        : typeof body.bio === "string"
          ? body.bio.trim()
          : null;
    const profileVisibility = body.profileVisibility;
    const showStudentId = body.showStudentId;
    const showPhoneNumber = body.showPhoneNumber;

    if (!isValidName(name)) {
      return NextResponse.json(
        { error: "Enter a valid name between 2 and 100 characters." },
        { status: 400 },
      );
    }

    if (phoneNumber === null || !isValidPhone(phoneNumber)) {
      return NextResponse.json(
        { error: "Enter a valid phone number or leave the phone number empty." },
        { status: 400 },
      );
    }

    if (bio === null || bio.length > 500) {
      return NextResponse.json(
        { error: "Bio must be 500 characters or fewer." },
        { status: 400 },
      );
    }

    if (!isProfileVisibility(profileVisibility)) {
      return NextResponse.json(
        { error: "Select a valid profile visibility setting." },
        { status: 400 },
      );
    }

    if (typeof showStudentId !== "boolean" || typeof showPhoneNumber !== "boolean") {
      return NextResponse.json(
        { error: "Privacy settings must be valid boolean values." },
        { status: 400 },
      );
    }

    const existingProfile = await prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!existingProfile) {
      return NextResponse.json(
        { error: "Student profile not found. Complete onboarding first." },
        { status: 404 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const studentProfile = await tx.studentProfile.update({
        where: { id: existingProfile.id },
        data: {
          phoneNumber: phoneNumber || null,
          bio: bio || null,
          profileVisibility,
          showStudentId,
          showPhoneNumber,
        },
        select: {
          id: true,
          studentId: true,
          gender: true,
          status: true,
          phoneNumber: true,
          bio: true,
          profileVisibility: true,
          showStudentId: true,
          showPhoneNumber: true,
        },
      });

      const user = await tx.user.update({
        where: { id: session.user.id },
        data: { name },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      });

      return { studentProfile, user };
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Student profile PATCH failed:", error);

    return NextResponse.json(
      { error: "Unable to save your profile changes." },
      { status: 500 },
    );
  }
}