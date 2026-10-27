import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ studentProfileID: string }> };
const unavailable = () => NextResponse.json({ error: "This student profile is not available." }, { status: 404 });

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return NextResponse.json({ error: "You must be signed in to view this profile." }, { status: 401 });

    const { studentProfileID } = await params;
    if (!studentProfileID?.trim() || studentProfileID.length > 100) {
      return NextResponse.json({ error: "A valid student profile ID is required." }, { status: 400 });
    }

    const target = await prisma.studentProfile.findUnique({
      where: { id: studentProfileID },
      select: { id: true, universityId: true, profileVisibility: true },
    });
    if (!target || target.profileVisibility === "PRIVATE") return unavailable();

    const academicMate = await prisma.academicMateProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, universityId: true },
    });
    if (!academicMate || academicMate.universityId !== target.universityId) return unavailable();

    const relationship = await prisma.mateRequest.findFirst({
      where: {
        studentProfileId: target.id,
        universityId: target.universityId,
        status: { in: ["REQUESTED", "ACCEPTED"] },
        offering: { is: { academicMateProfileId: academicMate.id } },
      },
      select: { id: true },
    });
    if (!relationship) return unavailable();

    const profile = await prisma.studentProfile.findUnique({
      where: { id: target.id },
      select: {
        id: true,
        gender: true,
        studentId: true,
        phoneNumber: true,
        bio: true,
        profileVisibility: true,
        showStudentId: true,
        showPhoneNumber: true,
        user: { select: { name: true, image: true } },
        university: { select: { name: true, code: true } },
        programme: {
          select: {
            name: true,
            code: true,
            level: true,
            school: { select: { name: true, code: true } },
            department: { select: { name: true, code: true } },
          },
        },
        programmeYear: { select: { yearNumber: true } },
        courses: {
          where: { status: "ENROLLED", academicYear: { is: { isCurrent: true } } },
          orderBy: { course: { code: "asc" } },
          take: 50,
          select: {
            id: true,
            semester: true,
            course: { select: { id: true, code: true, name: true } },
            academicYear: { select: { name: true, isCurrent: true } },
          },
        },
      },
    });

    if (!profile || profile.profileVisibility === "PRIVATE") return unavailable();

    return NextResponse.json({
      profile: {
        studentProfile: {
          id: profile.id,
          gender: profile.gender,
          bio: profile.bio,
          studentId: profile.showStudentId ? profile.studentId : null,
          phoneNumber: profile.showPhoneNumber ? profile.phoneNumber : null,
        },
        user: profile.user,
        university: profile.university,
        programme: profile.programme,
        programmeYear: profile.programmeYear,
        courses: profile.courses,
      },
    });
  } catch (error) {
    console.error("Student mate profile GET failed:", error);
    return NextResponse.json({ error: "Unable to load this student profile." }, { status: 500 });
  }
}