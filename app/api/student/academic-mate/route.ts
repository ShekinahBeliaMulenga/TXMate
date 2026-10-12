import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

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
      },
    });

    if (!student) {
      return NextResponse.json(
        {
          error: "Student profile not found. Complete onboarding first.",
        },
        { status: 404 },
      );
    }

    // Search all eligible offerings at the student's university.
    // A course does not need to be part of the student's curriculum.
    const offerings = await prisma.mateOffering.findMany({
      where: {
        universityId: student.universityId,
        status: "ACTIVE",
        course: {
          is: {
            isActive: true,
          },
        },
        academicMateProfile: {
          status: "ACTIVE",
          verificationStatus: "VERIFIED",
          profileVisibility: {
            in: ["PUBLIC", "MEMBERS_ONLY"],
          },
        },
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
        course: {
          select: {
            id: true,
            code: true,
            name: true,
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
            user: {
              select: {
                id: true,
                name: true,
                image: true,
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
            status: {
              in: ["REQUESTED", "ACCEPTED"],
            },
          },
          select: {
            id: true,
            offeringId: true,
            status: true,
          },
        })
      : [];

    const requestsByOffering = new Map(
      existingRequests.map((request) => [
        request.offeringId,
        {
          id: request.id,
          status: request.status,
        },
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
      academicMate: offering.academicMateProfile,
      existingRequest:
        requestsByOffering.get(offering.id) ?? null,
    }));

    // Return every course with an eligible offering so that
    // the existing course filter includes courses outside
    // the student's registered curriculum.
    const matchedCourses = Array.from(
      new Map(
        offerings.map((offering) => [
          offering.course.id,
          offering.course,
        ]),
      ).values(),
    );

    return NextResponse.json({
      academicMates,
      matchedCourses,
    });
  } catch (error) {
    console.error("Academic Mate matching GET failed:", error);

    return NextResponse.json(
      { error: "Unable to find Academic Mates at this time." },
      { status: 500 },
    );
  }
}