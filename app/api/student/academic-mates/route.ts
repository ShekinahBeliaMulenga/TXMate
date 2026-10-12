import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
      return NextResponse.json(
        { error: "You must be signed in to find an Academic Mate." },
        { status: 401 },
      );
    }

    const student = await prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        universityId: true,
        courses: {
          where: { status: { in: ["ENROLLED", "REPEATING"] } },
          select: {
            courseId: true,
            course: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json(
        { error: "Student profile not found. Complete onboarding first." },
        { status: 404 },
      );
    }

    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    const enrolledCourseIds = [...new Set(student.courses.map((course) => course.courseId))];

    // Empty search: show recommendations only for enrolled/repeating courses.
    // Non-empty search: search all eligible offerings at the student's university.
    if (!query && enrolledCourseIds.length === 0) {
      return NextResponse.json({
        academicMates: [],
        matchedCourses: [],
        mode: "suggestions",
      });
    }

    const searchConditions = query
      ? {
          OR: [
            { course: { code: { contains: query, mode: "insensitive" as const } } },
            { course: { name: { contains: query, mode: "insensitive" as const } } },
            { title: { contains: query, mode: "insensitive" as const } },
            { description: { contains: query, mode: "insensitive" as const } },
            {
              academicMateProfile: {
                user: { name: { contains: query, mode: "insensitive" as const } },
              },
            },
            {
              academicMateProfile: {
                headline: { contains: query, mode: "insensitive" as const },
              },
            },
            {
              academicMateProfile: {
                bio: { contains: query, mode: "insensitive" as const },
              },
            },
            {
              academicMateProfile: {
                teachingExperience: { contains: query, mode: "insensitive" as const },
              },
            },
            {
              topics: {
                some: {
                  topic: { name: { contains: query, mode: "insensitive" as const } },
                },
              },
            },
          ],
        }
      : { courseId: { in: enrolledCourseIds } };

    const offerings = await prisma.mateOffering.findMany({
      where: {
        universityId: student.universityId,
        status: "ACTIVE",
        course: { isActive: true },
        academicMateProfile: {
          status: "ACTIVE",
          verificationStatus: "VERIFIED",
          profileVisibility: { in: ["PUBLIC", "MEMBERS_ONLY"] },
        },
        ...searchConditions,
      },
      orderBy: [
        { course: { code: "asc" } },
        { academicMateProfile: { user: { name: "asc" } } },
      ],
      select: {
        id: true,
        title: true,
        description: true,
        rate: true,
        currency: true,
        sessionDurationMinutes: true,
        rateType: true,
        rateDetails: true,
        course: { select: { id: true, code: true, name: true } },
        topics: {
          select: {
            topic: { select: { id: true, name: true, description: true } },
          },
        },
        academicMateProfile: {
          select: {
            id: true,
            headline: true,
            bio: true,
            teachingExperience: true,
            yearsExperience: true,
            verificationStatus: true,
            user: { select: { id: true, name: true, image: true } },
            studentProfile: {
              select: {
                programme: {
                  select: {
                    department: { select: { id: true, code: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const offeringIds = offerings.map((offering) => offering.id);
    const existingRequests = offeringIds.length
      ? await prisma.mateRequest.findMany({
          where: {
            studentProfileId: student.id,
            offeringId: { in: offeringIds },
            status: { in: ["REQUESTED", "ACCEPTED"] },
          },
          select: { id: true, offeringId: true, status: true },
        })
      : [];

    const requestsByOffering = new Map(
      existingRequests.map((item) => [
        item.offeringId,
        { id: item.id, status: item.status },
      ]),
    );

    const academicMates = offerings.map((offering) => ({
      offeringId: offering.id,
      title: offering.title,
      description: offering.description,
      rate: offering.rate.toString(),
      currency: offering.currency,
      sessionDurationMinutes: offering.sessionDurationMinutes,
      rateType: offering.rateType,
      rateDetails: offering.rateDetails,
      course: offering.course,
      topics: offering.topics.map(({ topic }) => topic),
      academicMate: offering.academicMateProfile,
      existingRequest: requestsByOffering.get(offering.id) ?? null,
    }));

    // Only courses represented in the current result set appear in the
    // course filter. This never builds a dropdown from the whole catalogue.
    const matchedCourses = [
      ...new Map(
        offerings.map((offering) => [offering.course.id, offering.course]),
      ).values(),
    ];

    return NextResponse.json({
      academicMates,
      matchedCourses,
      mode: query ? "search" : "suggestions",
    });
  } catch (error) {
    console.error("Academic Mate matching GET failed:", error);
    return NextResponse.json(
      { error: "Unable to find Academic Mates at this time." },
      { status: 500 },
    );
  }
}
