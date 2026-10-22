import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uniqueViolationTarget } from "@/lib/db-errors";
import { PHONE_FORMAT_MESSAGE, PHONE_TAKEN_MESSAGE, normalizeZambianMobile, zambianPhoneVariants } from "@/lib/zambia-phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileVisibility = "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const isProfileVisibility = (v: unknown): v is ProfileVisibility => v === "PUBLIC" || v === "MEMBERS_ONLY" || v === "PRIVATE";

function isValidName(value: string) {
  if (value.length < 2 || value.length > 100) return false;
  if (/\p{Cc}/u.test(value)) return false;
  return /\p{L}/u.test(value);
}

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return fail("You must be signed in to view your student profile.", 401);

    const profile = await prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true, studentId: true, gender: true, status: true, phoneNumber: true, bio: true,
        profileVisibility: true, showStudentId: true, showPhoneNumber: true, createdAt: true, updatedAt: true,
        user: { select: { id: true, name: true, email: true, image: true } },
        university: { select: { id: true, code: true, name: true, slug: true } },
        programme: {
          select: {
            id: true, code: true, name: true, level: true, durationYears: true,
            school: { select: { id: true, code: true, name: true } },
            department: { select: { id: true, code: true, name: true } },
          },
        },
        programmeYear: { select: { id: true, yearNumber: true } },
        courses: {
          orderBy: { course: { code: "asc" } },
          select: {
            id: true, semester: true, status: true,
            course: { select: { id: true, code: true, name: true, description: true, credits: true } },
            academicYear: { select: { id: true, name: true, startDate: true, endDate: true, isCurrent: true } },
          },
        },
      },
    });
    if (!profile) return fail("Student profile not found. Complete onboarding first.", 404);

    // Load the Academic Mate identity directly by userId so it is recognised even when studentProfileId is not linked.
    const academicMate = await prisma.academicMateProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, status: true, verificationStatus: true },
    });

    const programmeCourses = await prisma.programmeCourse.findMany({
      where: { programmeYearId: profile.programmeYear.id },
      select: {
        courseId: true,
        isCompulsory: true,
        electiveGroup: { select: { id: true, name: true, minSelections: true, maxSelections: true } },
      },
    });
    const curriculumByCourseId = new Map(programmeCourses.map((item) => [item.courseId, item]));

    const courses = profile.courses.map((studentCourse) => {
      const curriculum = curriculumByCourseId.get(studentCourse.course.id);
      return {
        id: studentCourse.id,
        semester: studentCourse.semester,
        status: studentCourse.status,
        isInCurriculum: curriculum !== undefined,
        isCompulsory: curriculum?.isCompulsory ?? false,
        electiveGroup: curriculum?.electiveGroup ?? null,
        course: studentCourse.course,
        academicYear: studentCourse.academicYear,
      };
    });
    const currentAcademicYear = courses.find((c) => c.academicYear.isCurrent)?.academicYear ?? courses[0]?.academicYear ?? null;

    return NextResponse.json({
      studentProfile: {
        id: profile.id, studentId: profile.studentId, gender: profile.gender, status: profile.status,
        phoneNumber: profile.phoneNumber, bio: profile.bio, profileVisibility: profile.profileVisibility,
        showStudentId: profile.showStudentId, showPhoneNumber: profile.showPhoneNumber,
        createdAt: profile.createdAt, updatedAt: profile.updatedAt,
      },
      user: profile.user,
      academicMate,
      university: profile.university,
      academic: {
        school: profile.programme.school,
        department: profile.programme.department,
        programme: {
          id: profile.programme.id, code: profile.programme.code, name: profile.programme.name,
          level: profile.programme.level, durationYears: profile.programme.durationYears,
        },
        year: profile.programmeYear,
        currentAcademicYear,
        courses,
      },
    });
  } catch (error) {
    console.error("Student profile GET failed:", error);
    return fail("Unable to load your student profile.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return fail("You must be signed in to update your profile.", 401);

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return fail("Request body must contain valid JSON.", 400);
    }
    if (!body || typeof body !== "object") return fail("Request body must contain valid JSON.", 400);

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const rawPhone = body.phoneNumber == null ? "" : typeof body.phoneNumber === "string" ? body.phoneNumber.trim() : null;
    const bio = body.bio == null ? "" : typeof body.bio === "string" ? body.bio.trim() : null;
    const { profileVisibility, showStudentId, showPhoneNumber } = body;

    if (!isValidName(name)) return fail("Enter a valid name between 2 and 100 characters.", 400);
    if (rawPhone === null) return fail(PHONE_FORMAT_MESSAGE, 400);
    if (bio === null || bio.length > 500) return fail("Bio must be 500 characters or fewer.", 400);
    if (!isProfileVisibility(profileVisibility)) return fail("Select a valid profile visibility setting.", 400);
    if (typeof showStudentId !== "boolean" || typeof showPhoneNumber !== "boolean") {
      return fail("Privacy settings must be valid boolean values.", 400);
    }

    const existingProfile = await prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, phoneNumber: true },
    });
    if (!existingProfile) return fail("Student profile not found. Complete onboarding first.", 404);

    // An empty phone number is allowed. An unchanged value is kept as-is (so older saved formats never block
    // other edits); a changed value must be a valid Zambian mobile number that no other account uses.
    let phoneNumber = existingProfile.phoneNumber;
    if (rawPhone !== (existingProfile.phoneNumber ?? "")) {
      if (rawPhone === "") {
        phoneNumber = null;
      } else {
        const normalized = normalizeZambianMobile(rawPhone);
        if (!normalized) return fail(PHONE_FORMAT_MESSAGE, 400);
        const duplicate = await prisma.studentProfile.findFirst({
          where: { phoneNumber: { in: zambianPhoneVariants(normalized) }, NOT: { id: existingProfile.id } },
          select: { id: true },
        });
        if (duplicate) return fail(PHONE_TAKEN_MESSAGE, 409);
        phoneNumber = normalized;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const studentProfile = await tx.studentProfile.update({
        where: { id: existingProfile.id },
        data: { phoneNumber, bio: bio || null, profileVisibility, showStudentId, showPhoneNumber },
        select: {
          id: true, studentId: true, gender: true, status: true, phoneNumber: true, bio: true,
          profileVisibility: true, showStudentId: true, showPhoneNumber: true,
        },
      });
      const user = await tx.user.update({
        where: { id: session.user.id },
        data: { name },
        select: { id: true, name: true, email: true, image: true },
      });
      return { studentProfile, user };
    });

    return NextResponse.json(updated);
  } catch (error) {
    // A concurrent request can pass the check above and hit the database unique constraint.
    const target = uniqueViolationTarget(error);
    if (target !== null && (target === "" || target.includes("phone"))) return fail(PHONE_TAKEN_MESSAGE, 409);
    console.error("Student profile PATCH failed:", error);
    return fail("Unable to save your profile changes.", 500);
  }
}